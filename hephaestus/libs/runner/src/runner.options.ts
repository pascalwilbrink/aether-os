import type { Env } from '@hephaestus/core';
import type { ConcurrencyLimits } from '@hephaestus/tasks';

/** The runner's limits and timeouts (docs/tasks.md), from the environment. */
export interface RunnerOptions {
  /** False with `AGENT_RUNTIME=none`: nothing polls (tests call `tick`). */
  enabled: boolean;
  pollIntervalMs: number;
  maxExecutions: number;
  limits: ConcurrencyLimits;
  provisioningTimeoutMs: number;
  runTimeoutMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  stopGraceMs: number;
  maxInfrastructureFailures: number;
  retryBackoffMs: number;
  /** Runs of the agent per execution while acceptance criteria fail. */
  maxVerificationRounds: number;
}

export const RUNNER_OPTIONS = Symbol('RUNNER_OPTIONS');

export function runnerOptionsFrom(
  get: <K extends keyof Env>(key: K) => Env[K],
): RunnerOptions {
  return {
    enabled: get('AGENT_RUNTIME') !== 'none',
    pollIntervalMs: get('RUNNER_POLL_INTERVAL_MS'),
    maxExecutions: get('RUNNER_MAX_EXECUTIONS'),
    limits: {
      perOrganization: get('RUNNER_MAX_TASKS_PER_ORGANIZATION'),
      perProject: get('RUNNER_MAX_TASKS_PER_PROJECT'),
    },
    provisioningTimeoutMs: get('RUNNER_PROVISIONING_TIMEOUT_MS'),
    runTimeoutMs: get('RUNNER_RUN_TIMEOUT_MS'),
    heartbeatIntervalMs: get('RUNNER_HEARTBEAT_INTERVAL_MS'),
    heartbeatTimeoutMs: get('RUNNER_HEARTBEAT_TIMEOUT_MS'),
    stopGraceMs: get('RUNNER_STOP_GRACE_MS'),
    maxInfrastructureFailures: get('RUNNER_MAX_INFRASTRUCTURE_FAILURES'),
    retryBackoffMs: get('RUNNER_RETRY_BACKOFF_MS'),
    maxVerificationRounds: get('VERIFICATION_MAX_ROUNDS'),
  };
}
