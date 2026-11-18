import type { WorkspaceSandbox } from '@mastra/core/workspace';

/** One sandbox to create; every limit is set (../CLAUDE.md: hardened). */
export interface SandboxSpec {
  /** Stable for the execution: creating twice finds the same sandbox. */
  sandboxId: string;
  image: string;
  /** `uid:gid`, never root. */
  user: string;
  cpus: number;
  memoryMb: number;
  pidsLimit: number;
  /** Size of the writable working directory (the only writable place, with /tmp). */
  workspaceMb: number;
  workingDirectory: string;
  labels: Record<string, string>;
}

export interface CreatedSandbox {
  /** The driver's own ID for it (a container ID). */
  resourceId: string;
  agentSandbox: WorkspaceSandbox;
}

/** A command to run in a sandbox, as its user. */
export interface SandboxExecOptions {
  /** Bytes for the command's standard input (then closed). */
  stdin?: Buffer;
  workingDirectory?: string;
  /** Default 60 seconds; the command is abandoned after it. */
  timeoutMs?: number;
}

export interface SandboxExecResult {
  exitCode: number;
  /** Raw bytes: a bundle comes out this way. */
  stdout: Buffer;
  stderr: string;
}

/**
 * Creates and removes sandboxes on one backend (Docker locally; a
 * microVM-backed provider later). Both are idempotent per `sandboxId`.
 */
export abstract class SandboxDriver {
  abstract readonly provider: string;

  abstract create(
    spec: SandboxSpec,
    signal: AbortSignal,
  ): Promise<CreatedSandbox>;

  /** Removes it if it exists. */
  abstract remove(sandboxId: string): Promise<void>;

  /**
   * Runs a command in the sandbox, with bytes in and out. How Hephaestus
   * moves a repository in and commits out of a sandbox that has no
   * network and no writable place but its tmpfs (`docker cp` can't reach
   * either).
   */
  abstract exec(
    sandboxId: string,
    command: string[],
    options?: SandboxExecOptions,
  ): Promise<SandboxExecResult>;
}
