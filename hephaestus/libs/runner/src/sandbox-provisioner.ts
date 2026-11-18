import type { ApiTypes } from '@hephaestus/core';
import type { TaskResponse } from '@hephaestus/tasks';

/** A sandbox an execution runs in, as its provisioner knows it. */
export interface Sandbox {
  /** The provisioner's own reference, stored on the execution. */
  reference: Record<string, unknown>;
}

export interface SandboxRequest {
  task: TaskResponse;
  executionId: string;
  agentVersion: ApiTypes.AgentVersionResponse;
  signal: AbortSignal;
}

/**
 * Provisions and destroys sandboxes (the `SandboxProvisioner` port,
 * ../CLAUDE.md). `destroy` must be idempotent: the runner and the reaper
 * can both call it for the same sandbox.
 */
export abstract class SandboxProvisioner {
  /** A sandbox for the execution, or null if the agent version needs none. */
  abstract provision(request: SandboxRequest): Promise<Sandbox | null>;

  abstract destroy(reference: Record<string, unknown>): Promise<void>;
}
