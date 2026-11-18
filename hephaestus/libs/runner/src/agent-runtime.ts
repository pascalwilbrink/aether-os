import type { NewArtifact } from '@hephaestus/artifacts';
import type { ApiTypes } from '@hephaestus/core';
import type { TaskResponse } from '@hephaestus/tasks';

import type { Sandbox } from './sandbox-provisioner.js';

export interface AgentRunInput {
  task: TaskResponse;
  executionId: string;
  /** The task's pinned agent version. */
  agentVersion: ApiTypes.AgentVersionResponse;
  /** Null when the agent version needs none (`runtime.sandboxRequired`). */
  sandbox: Sandbox | null;
  /**
   * The task token (Pistis, token exchange): the service account, limited to
   * the task's project. For the agent's calls to Aether-os; never logged or
   * stored.
   */
  token: string;
  /** Where the agent records what it produces (docs/tasks.md, Artifacts). */
  artifacts: ArtifactSink;
  /**
   * For a revision run: the drafts reviewers sent back, each with their
   * comments (`review`). The agent revises each (`revisionOf`). Empty
   * otherwise.
   */
  revisions: ApiTypes.ArtifactResponse[];
  /**
   * Aborted when the execution must stop (cancelled, timed out, lost, or
   * Hephaestus shutting down): save what's needed and return quickly.
   */
  signal: AbortSignal;
}

/**
 * Records an artifact for the running execution (`pending` until it ends).
 * Rejects with `ArtifactRejectedError` past a limit or once it ended.
 */
export interface ArtifactSink {
  submit(artifact: NewArtifact): Promise<{ artifactId: string }>;
}

export type AgentRunResult =
  /**
   * The agent finished, with its final answer (the primary artifact unless
   * it recorded one).
   */
  | { outcome: 'completed'; summary: string }
  /** The agent gave up (not an infrastructure problem: not retried). */
  | { outcome: 'failed'; error: string };

/**
 * Runs an agent version on a task (the runtime port, ../CLAUDE.md:
 * Mastra behind it later). Throwing means an infrastructure failure
 * (`RunnerFailure` says whether it's worth retrying; anything else is).
 */
export abstract class AgentRuntime {
  abstract run(input: AgentRunInput): Promise<AgentRunResult>;
}
