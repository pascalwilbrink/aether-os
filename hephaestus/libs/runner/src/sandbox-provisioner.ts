import type { WorkspaceSandbox } from '@mastra/core/workspace';

import type { AgentVersion } from '@hephaestus/core';
import type { TaskResponse } from '@hephaestus/tasks';

import type {
  SandboxExecOptions,
  SandboxExecResult,
} from './sandbox-driver.js';

/** A sandbox an execution runs in. */
export interface Sandbox {
  /** The provisioner's own reference, stored on the execution. */
  reference: Record<string, unknown>;
  /** The sandbox as the agent runtime's workspace uses it (Mastra). */
  agentSandbox?: WorkspaceSandbox;
  /** Hephaestus's own commands, with bytes in and out (repositories). */
  exec?: (
    command: string[],
    options?: SandboxExecOptions,
  ) => Promise<SandboxExecResult>;
}

export interface SandboxRequest {
  task: TaskResponse;
  executionId: string;
  agentVersion: AgentVersion;
  /** Aborted when the execution stops: give up, and leave nothing behind. */
  signal: AbortSignal;
}

/** What to tear down: an execution's sandbox, by reference if known. */
export interface SandboxRelease {
  organizationId: string;
  executionId: string;
  reference: Record<string, unknown> | null;
}

/**
 * Provisions and destroys sandboxes (the `SandboxProvisioner` port,
 * ../CLAUDE.md). `destroy` must be idempotent and work without a reference
 * (an execution that ended while provisioning): the runner calls it for
 * every execution that ends, and the reaper for every one it ends.
 */
export abstract class SandboxProvisioner {
  /** A sandbox for the execution, or null if the agent version needs none. */
  abstract provision(request: SandboxRequest): Promise<Sandbox | null>;

  abstract destroy(release: SandboxRelease): Promise<void>;
}
