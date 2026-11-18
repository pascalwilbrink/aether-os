import {
  AgentRuntime,
  RunnerFailure,
  SandboxProvisioner,
  TaskTokens,
  type AgentRunInput,
  type AgentRunResult,
  type RunnerOptions,
  type Sandbox,
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

/** Sandboxes that are only records of what was provisioned and destroyed. */
export class FakeSandboxProvisioner extends SandboxProvisioner {
  readonly provisioned: string[] = [];
  readonly destroyed: Record<string, unknown>[] = [];

  provision({ executionId }: SandboxRequest): Promise<Sandbox | null> {
    this.provisioned.push(executionId);
    return Promise.resolve({ reference: { sandboxId: `sbx-${executionId}` } });
  }

  destroy(reference: Record<string, unknown>): Promise<void> {
    this.destroyed.push(reference);
    return Promise.resolve();
  }
}

export { RunnerFailure };
