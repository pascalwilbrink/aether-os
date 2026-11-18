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
  /**
   * Aborted when the execution must stop (cancelled, timed out, lost, or
   * Hephaestus shutting down): save what's needed and return quickly.
   */
  signal: AbortSignal;
}

export type AgentRunResult =
  /** The agent finished; what it reported. */
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
