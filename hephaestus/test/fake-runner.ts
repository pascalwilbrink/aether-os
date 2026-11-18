import {
  AgentRuntime,
  RunnerFailure,
  SandboxProvisioner,
  TaskTokens,
  type AgentRunInput,
  type AgentRunResult,
  type RunnerOptions,
  type Sandbox,
  type SandboxRelease,
  type SandboxRequest,
  type TaskTokenRequest,
} from '@hephaestus/runner';

/** Runner options for tests: no polling (call `tick`), short waits. */
export function testRunnerOptions(
  overrides: Partial<RunnerOptions> = {},
): RunnerOptions {
  return {
    enabled: false,
    pollIntervalMs: 1000,
    maxExecutions: 4,
    limits: { perOrganization: 10, perProject: 5 },
    provisioningTimeoutMs: 60_000,
    runTimeoutMs: 60_000,
    heartbeatIntervalMs: 60_000,
    heartbeatTimeoutMs: 120_000,
    stopGraceMs: 50,
    maxInfrastructureFailures: 3,
    retryBackoffMs: 0,
    maxVerificationRounds: 3,
    ...overrides,
  };
}

/** Resolves when the signal aborts (a runtime that waits to be stopped). */
export function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), {
      once: true,
    });
  });
}

/** An agent runtime the test scripts: completes at once unless told otherwise. */
export class FakeAgentRuntime extends AgentRuntime {
  readonly runs: AgentRunInput[] = [];
  behaviour: (input: AgentRunInput) => Promise<AgentRunResult> = () =>
    Promise.resolve({ outcome: 'completed', summary: 'Done.' });

  run(input: AgentRunInput): Promise<AgentRunResult> {
    this.runs.push(input);
    return this.behaviour(input);
  }
}

/** Task tokens without Pistis; `refuse` makes the next ones fail. */
export class FakeTaskTokens extends TaskTokens {
  readonly issued: TaskTokenRequest[] = [];
  refuse: RunnerFailure | undefined;

  issue(request: TaskTokenRequest): Promise<string> {
    this.issued.push(request);
    return this.refuse
      ? Promise.reject(this.refuse)
      : Promise.resolve(`task-token-for-${request.taskId}`);
  }
}

/** What a scripted sandbox command returns. */
export interface FakeCommandResult {
  exitCode: number;
  output?: string;
  timedOut?: boolean;
}

/**
 * Sandboxes that are only records of what was provisioned and destroyed.
 * Commands (verification's `command` checks) answer from `commands`: each
 * call takes the next result for that command, the last one repeating.
 */
export class FakeSandboxProvisioner extends SandboxProvisioner {
  readonly provisioned: string[] = [];
  readonly destroyed: Record<string, unknown>[] = [];
  readonly commands = new Map<string, FakeCommandResult[]>();
  readonly ran: string[] = [];

  provision({
    executionId,
    agentVersion,
  }: SandboxRequest): Promise<Sandbox | null> {
    this.provisioned.push(executionId);
    const executeCommand = (command: string) => {
      this.ran.push(command);
      const results = this.commands.get(command) ?? [{ exitCode: 127 }];
      const result = results.length > 1 ? results.shift()! : results[0];
      return Promise.resolve({
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.output ?? '',
        stderr: '',
        executionTimeMs: 1,
        timedOut: result.timedOut,
      });
    };
    return Promise.resolve({
      reference: { sandboxId: `sbx-${executionId}` },
      // Only for versions that run in a sandbox (as the real one).
      ...(agentVersion.runtime.sandboxRequired
        ? {
            agentSandbox: {
              executeCommand,
            } as unknown as Sandbox['agentSandbox'],
          }
        : {}),
    });
  }

  /** Every release, and the references of those that had a sandbox. */
  readonly releases: SandboxRelease[] = [];

  destroy(release: SandboxRelease): Promise<void> {
    this.releases.push(release);
    if (release.reference) {
      this.destroyed.push(release.reference);
    }
    return Promise.resolve();
  }
}

export { RunnerFailure };
