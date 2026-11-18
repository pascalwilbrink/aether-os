import { Injectable, Logger } from '@nestjs/common';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Workspace } from '@mastra/core/workspace';
import { z } from 'zod';

import { SecretStoreUnavailableError } from '@hephaestus/core';
import {
  ModelGateway,
  ModelKeyMissingError,
  type ModelCallContext,
  type ResolvedModel,
} from '@hephaestus/models';

import type { NewArtifact } from '@hephaestus/artifacts';

import {
  AgentRuntime,
  type AgentRunInput,
  type AgentRunResult,
  type ArtifactSink,
} from './agent-runtime.js';
import { RunnerFailure } from './runner.errors.js';

/** Model calls (agent loop steps) one execution may make. */
const MAX_STEPS = 20;
/** Retries of a model call on 429 and 5xx, within the execution. */
const MODEL_RETRIES = 2;

/**
 * Runs an agent version with Mastra (../../CLAUDE.md): the version's
 * instructions and model become a Mastra `Agent`, the model resolved by the
 * model gateway (key from OpenBao), and the task's title and instructions
 * are its input. Every step is metered. With a sandbox, the agent gets a
 * Mastra workspace on it (shell tools: run a command, read a background
 * process's output, stop it). Configured tools and skills aren't supported
 * yet, so a version that enables any fails rather than running without them.
 */
@Injectable()
export class MastraAgentRuntime extends AgentRuntime {
  private readonly logger = new Logger(MastraAgentRuntime.name);

  constructor(private readonly gateway: ModelGateway) {
    super();
  }

  async run({
    task,
    executionId,
    agentVersion,
    sandbox,
    artifacts,
    revisions,
    failedChecks,
    repository,
    signal,
  }: AgentRunInput): Promise<AgentRunResult> {
    const unsupported = [
      ...agentVersion.tools.filter((tool) => tool.enabled).map((t) => t.name),
      ...agentVersion.skills
        .filter((skill) => skill.enabled)
        .map((s) => `${s.name}@${s.version}`),
    ];
    if (unsupported.length > 0) {
      throw new RunnerFailure(
        `Tools and skills aren't supported yet (${unsupported.join(', ')})`,
        'infrastructure',
        false,
      );
    }

    const context: ModelCallContext = {
      organizationId: task.organizationId,
      projectId: task.projectId,
      taskId: task.id,
      executionId,
      agentVersionId: agentVersion.id,
    };
    const resolved = await this.resolve(context, agentVersion.model);
    const agent = new Agent({
      id: `agent-version-${agentVersion.id}`,
      name: `${agentVersion.agentId} v${agentVersion.version}`,
      instructions: agentVersion.instructions,
      model: resolved.model,
      tools: { submit_artifact: submitArtifactTool(artifacts) },
      // The execution's sandbox, with Mastra's workspace tools (running
      // commands in it); none without one.
      ...(sandbox?.agentSandbox
        ? { workspace: new Workspace({ sandbox: sandbox.agentSandbox }) }
        : {}),
    });

    // Every call is metered, including those of a run that fails.
    const metering: Promise<void>[] = [];
    try {
      const result = await agent.generate(
        promptFor(task, revisions, failedChecks, repository),
        {
          abortSignal: signal,
          maxSteps: MAX_STEPS,
          modelSettings: {
            temperature: agentVersion.model.temperature,
            maxOutputTokens: agentVersion.model.maxTokens,
            maxRetries: MODEL_RETRIES,
          },
          onStepFinish: (step) => {
            metering.push(
              this.gateway.record(context, resolved, {
                inputTokens: step.usage?.inputTokens,
                outputTokens: step.usage?.outputTokens,
                finishReason: step.finishReason,
              }),
            );
          },
        },
      );
      await Promise.all(metering);
      if (result.finishReason === 'error' || result.error) {
        throw toFailure(result.error);
      }
      return { outcome: 'completed', summary: result.text };
    } catch (error) {
      await Promise.allSettled(metering);
      throw toFailure(error);
    }
  }

  private async resolve(
    context: ModelCallContext,
    model: AgentRunInput['agentVersion']['model'],
  ): Promise<ResolvedModel> {
    try {
      return await this.gateway.resolve(context, model);
    } catch (error) {
      if (error instanceof ModelKeyMissingError) {
        // A configuration problem: retrying won't add a key.
        throw new RunnerFailure(error.message, 'infrastructure', false);
      }
      if (error instanceof SecretStoreUnavailableError) {
        throw new RunnerFailure(error.message, 'infrastructure');
      }
      throw error;
    }
  }
}

/**
 * The task as the agent's input; for a revision run, followed by what
 * reviewers sent back: each artifact, its content and their comments.
 */
export function promptFor(
  task: AgentRunInput['task'],
  revisions: AgentRunInput['revisions'],
  failedChecks: AgentRunInput['failedChecks'] = [],
  repository: AgentRunInput['repository'] = null,
): string {
  const prompt = withFailedChecks(
    withRepository(`# ${task.title}\n\n${task.instructions}`, repository),
    failedChecks,
  );
  if (revisions.length === 0) {
    return prompt;
  }
  const requests = revisions.map((artifact) => {
    const content =
      artifact.kind === 'text'
        ? artifact.content
        : JSON.stringify((artifact as { content?: unknown }).content, null, 2);
    const comments = (artifact.review?.comments ?? [])
      .map((comment) =>
        comment.anchor
          ? `- (${comment.anchor}) ${comment.body}`
          : `- ${comment.body}`,
      )
      .join('\n');
    return [
      `### ${artifact.title} (artifact ${artifact.id}, ${artifact.kind})`,
      '',
      'What you submitted:',
      '',
      '```',
      content,
      '```',
      '',
      'Reviewer comments:',
      '',
      comments,
    ].join('\n');
  });
  return [
    prompt,
    '',
    '## Changes requested',
    '',
    'A reviewer sent back what you submitted earlier. Submit a revised version of each artifact below with submit_artifact, setting `revises` to its artifact ID.',
    '',
    ...requests,
  ].join('\n');
}

/** Where the repository is, and that only commits are kept. */
function withRepository(
  prompt: string,
  repository: AgentRunInput['repository'],
): string {
  if (!repository) {
    return prompt;
  }
  return [
    prompt,
    '',
    '## Repository',
    '',
    `The repository ${repository.fullName} is checked out at ${repository.path}, on the branch ${repository.branch} (from ${repository.startedFrom}).`,
    'Make your changes there and commit them with git (`git add`, `git commit`): only commits are kept, and uncommitted changes are lost.',
    "There's no network: don't push, Aether-os takes your commits from here.",
  ].join('\n');
}

/**
 * After a verification round with failures: what failed and what the checks
 * said. The agent's earlier artifacts and its sandbox are kept.
 */
function withFailedChecks(
  prompt: string,
  failedChecks: AgentRunInput['failedChecks'],
): string {
  if (failedChecks.length === 0) {
    return prompt;
  }
  return [
    prompt,
    '',
    '## Acceptance criteria not met',
    '',
    "Your work was checked against the task's acceptance criteria and these failed. Fix them: your sandbox and the artifacts you already submitted are kept; submit new ones where they change.",
    '',
    ...failedChecks.map((check) =>
      [
        `### ${check.key}: ${check.description}`,
        '',
        '```',
        check.output,
        '```',
        '',
      ].join('\n'),
    ),
  ].join('\n');
}

/**
 * The tool an agent records its results with (docs/tasks.md, Artifacts).
 * Flat on purpose (one schema for every provider): JSON content comes as
 * text and is parsed here. A rejected artifact is a tool error the agent
 * sees and can react to.
 */
function submitArtifactTool(artifacts: ArtifactSink) {
  return createTool({
    id: 'submit_artifact',
    description:
      'Record something you produced for this task: a text (markdown or plain) or a JSON document. ' +
      'Mark the main outcome of the task with primary: true (the last one marked wins). ' +
      'If you mark none, your final answer becomes the outcome. ' +
      'Content is at most 256 KiB; at most 50 artifacts per run.',
    inputSchema: z.object({
      kind: z.enum(['text', 'json']),
      title: z.string().min(1).max(200).describe('A short name for it'),
      content: z
        .string()
        .describe('The text, or for kind json the JSON document as text'),
      format: z
        .enum(['markdown', 'plain'])
        .optional()
        .describe('For kind text; markdown if left out'),
      schema: z
        .string()
        .max(200)
        .optional()
        .describe("For kind json: an identifier of the document's schema"),
      primary: z.boolean().optional(),
      revises: z
        .string()
        .uuid()
        .optional()
        .describe(
          'When revising: the ID of the artifact a reviewer sent back that this replaces',
        ),
    }),
    execute: async (input) => {
      let artifact: NewArtifact;
      if (input.kind === 'text') {
        artifact = {
          kind: 'text',
          title: input.title,
          format: input.format ?? 'markdown',
          content: input.content,
          primary: input.primary,
          revisionOf: input.revises,
        };
      } else {
        let content: unknown;
        try {
          content = JSON.parse(input.content);
        } catch {
          throw new Error('content is not valid JSON');
        }
        artifact = {
          kind: 'json',
          title: input.title,
          schema: input.schema ?? null,
          content,
          primary: input.primary,
          revisionOf: input.revises,
        };
      }
      return artifacts.submit(artifact);
    },
  });
}

/**
 * A provider error as an execution failure: a refused key (401, 403) or a
 * bad request (400, 404: e.g. an unknown model) won't get better by
 * retrying; rate limits and server errors (already retried within the
 * execution) may.
 */
function toFailure(error: unknown): RunnerFailure {
  if (error instanceof RunnerFailure) {
    return error;
  }
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  const message = error instanceof Error ? error.message : String(error);
  if (typeof status === 'number' && [400, 401, 403, 404].includes(status)) {
    return new RunnerFailure(
      `The model provider refused the call (${status}): ${message}`,
      'infrastructure',
      false,
    );
  }
  return new RunnerFailure(
    typeof status === 'number'
      ? `The model provider failed (${status}): ${message}`
      : `The model call failed: ${message}`,
    'infrastructure',
  );
}
