import { Injectable } from '@nestjs/common';

import type { ApiTypes } from '@hephaestus/core';

import type { Sandbox } from './sandbox-provisioner.js';

/** A command's output kept in a result: its end, where failures show. */
export const MAX_OUTPUT_BYTES = 16 * 1024;
const DEFAULT_COMMAND_TIMEOUT_SECONDS = 300;

export interface VerificationInput {
  criteria: ApiTypes.AcceptanceCriterion[];
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
  async verify({
    criteria,
    artifacts,
    sandbox,
  }: VerificationInput): Promise<ApiTypes.CriterionResult[]> {
    const results: ApiTypes.CriterionResult[] = [];
    for (const criterion of criteria) {
      results.push({
        key: criterion.key,
        ...(await this.check(criterion.check, artifacts, sandbox)),
      });
    }
    return results;
  }

  private async check(
    check: ApiTypes.CriterionCheck,
    artifacts: ApiTypes.ArtifactResponse[],
    sandbox: Sandbox | null,
  ): Promise<Omit<ApiTypes.CriterionResult, 'key'>> {
    switch (check.type) {
      case 'manual':
        return { outcome: 'manual', output: 'Left to the reviewer.' };
      case 'artifact':
        return checkArtifacts(check, artifacts);
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
  for (const title of check.titles ?? []) {
    if (!artifacts.some((artifact) => artifact.title === title)) {
      problems.push(`No artifact titled "${title}".`);
    }
  }
  return problems.length === 0
    ? { outcome: 'passed', output: 'The artifacts are as expected.' }
    : { outcome: 'failed', output: problems.join('\n') };
}

/** The last `MAX_OUTPUT_BYTES` of a command's output. */
function tail(output: string): string {
  const bytes = Buffer.from(output);
  return bytes.length <= MAX_OUTPUT_BYTES
    ? output
    : `[…]\n${bytes.subarray(bytes.length - MAX_OUTPUT_BYTES).toString()}`;
}
