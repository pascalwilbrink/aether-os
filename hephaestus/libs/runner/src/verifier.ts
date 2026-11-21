import { Injectable } from '@nestjs/common';

import type { ApiTypes } from '@hephaestus/core';

import type { Sandbox } from './sandbox-provisioner.js';

/** A command's output kept in a result: its end, where failures show. */
export const MAX_OUTPUT_BYTES = 16 * 1024;
const DEFAULT_COMMAND_TIMEOUT_SECONDS = 300;

export interface VerificationInput {
  criteria: ApiTypes.AcceptanceCriterion[];
  /** The task's deliverables, which `deliverable` checks name. */
  deliverables?: ApiTypes.TaskDeliverable[];
  /** The task's repository in the sandbox, for `pull_request` deliverables. */
  repository?: { path: string; baseSha: string } | null;
  /** The run's artifacts and the task's final ones (`artifactsToVerify`). */
  artifacts: ApiTypes.ArtifactResponse[];
  sandbox: Sandbox | null;
}

/**
 * Checks a run against the task's acceptance criteria (docs/tasks.md,
 * Verification). Hephaestus runs the checks, never the agent: `command` in
 * the task's sandbox (exit code 0 passes), `artifact` on the recorded
 * artifacts, and `manual` is left to the reviewer. A check that can't run
 * (the sandbox is gone) throws: an infrastructure failure, never a pass.
 */
@Injectable()
export class Verifier {
  async verify(input: VerificationInput): Promise<ApiTypes.CriterionResult[]> {
    const results: ApiTypes.CriterionResult[] = [];
    for (const criterion of input.criteria) {
      results.push({
        key: criterion.key,
        ...(await this.check(criterion.check, input)),
      });
    }
    return results;
  }

  private async check(
    check: ApiTypes.CriterionCheck,
    {
      artifacts,
      sandbox,
      deliverables = [],
      repository = null,
    }: VerificationInput,
  ): Promise<Omit<ApiTypes.CriterionResult, 'key'>> {
    switch (check.type) {
      case 'manual':
        return { outcome: 'manual', output: 'Left to the reviewer.' };
      case 'artifact': {
        const deliverable = check.deliverable
          ? deliverables.find((d) => d.key === check.deliverable)
          : undefined;
        if (deliverable?.kind === 'pull_request') {
          return checkCommits(deliverable, sandbox, repository);
        }
        return checkArtifacts(check, artifacts);
      }
      case 'command': {
        const execute = sandbox?.agentSandbox?.executeCommand?.bind(
          sandbox.agentSandbox,
        );
        if (!execute) {
          throw new Error("A command check needs the task's sandbox");
        }
        const timeoutSeconds =
          check.timeoutSeconds ?? DEFAULT_COMMAND_TIMEOUT_SECONDS;
        const result = await execute(check.command, [], {
          timeout: timeoutSeconds * 1000,
        });
        const output = tail(`${result.stdout}${result.stderr}`);
        if (result.timedOut) {
          return {
            outcome: 'failed',
            output: `Timed out after ${timeoutSeconds} seconds.\n${output}`,
          };
        }
        return {
          outcome: result.exitCode === 0 ? 'passed' : 'failed',
          output:
            result.exitCode === 0
              ? output
              : `Exit code ${result.exitCode}.\n${output}`,
        };
      }
    }
  }
}

function checkArtifacts(
  check: Extract<ApiTypes.CriterionCheck, { type: 'artifact' }>,
  artifacts: ApiTypes.ArtifactResponse[],
): Omit<ApiTypes.CriterionResult, 'key'> {
  const problems: string[] = [];
  if (check.primaryKind) {
    const primary = artifacts.find(
      (artifact) => artifact.primary && artifact.status === 'pending',
    );
    if (primary?.kind !== check.primaryKind) {
      problems.push(
        `The primary artifact is ${primary ? `a ${primary.kind} artifact` : 'missing'}, not ${check.primaryKind}.`,
      );
    }
  }
  if (check.deliverable) {
    const submitted = artifacts.some(
      (artifact) =>
        artifact.deliverableKey === check.deliverable &&
        artifact.status !== 'partial' &&
        artifact.status !== 'rejected',
    );
    if (!submitted) {
      problems.push(
        `Nothing was submitted for the deliverable ${check.deliverable} (set deliverable: "${check.deliverable}" when submitting it).`,
      );
    }
  }
  for (const title of check.titles ?? []) {
    if (!artifacts.some((artifact) => artifact.title === title)) {
      problems.push(`No artifact titled "${title}".`);
    }
  }
  return problems.length === 0
    ? { outcome: 'passed', output: 'The artifacts are as expected.' }
    : { outcome: 'failed', output: problems.join('\n') };
}

/**
 * A `pull_request` deliverable: the run committed on top of where the
 * task's repository started (the commits become the pull request after
 * verification). Without a repository or a way to run git, it can't pass.
 */
async function checkCommits(
  deliverable: ApiTypes.TaskDeliverable,
  sandbox: Sandbox | null,
  repository: { path: string; baseSha: string } | null,
): Promise<Omit<ApiTypes.CriterionResult, 'key'>> {
  const execute = sandbox?.agentSandbox?.executeCommand?.bind(
    sandbox.agentSandbox,
  );
  if (!repository || !execute) {
    return {
      outcome: 'failed',
      output: `The deliverable ${deliverable.key} is a pull request, but the run has no repository to commit in.`,
    };
  }
  const result = await execute(
    'git',
    [
      '-C',
      repository.path,
      'rev-list',
      '--count',
      `${repository.baseSha}..HEAD`,
    ],
    { timeout: 30_000 },
  );
  const commits = Number.parseInt(result.stdout.trim(), 10);
  if (result.exitCode !== 0 || Number.isNaN(commits)) {
    throw new Error(
      `Couldn't count the commits in ${repository.path}: ${tail(result.stderr)}`,
    );
  }
  return commits > 0
    ? {
        outcome: 'passed',
        output: `${commits} commit${commits === 1 ? '' : 's'} for the pull request.`,
      }
    : {
        outcome: 'failed',
        output: `Nothing was committed in ${repository.path}: the deliverable ${deliverable.key} is a pull request made from your commits.`,
      };
}

/** The last `MAX_OUTPUT_BYTES` of a command's output. */
function tail(output: string): string {
  const bytes = Buffer.from(output);
  return bytes.length <= MAX_OUTPUT_BYTES
    ? output
    : `[…]\n${bytes.subarray(bytes.length - MAX_OUTPUT_BYTES).toString()}`;
}
