import type { NewArtifact } from '@hephaestus/artifacts';

import type { ExecutionActivity } from './execution-activity.js';
import type { AgentVersion, ApiTypes } from '@hephaestus/core';
import type { PinnedKnowledge, TaskResponse } from '@hephaestus/tasks';

import type { Sandbox } from './sandbox-provisioner.js';

export interface AgentRunInput {
  task: TaskResponse;
  executionId: string;
  /** The task's pinned agent version. */
  agentVersion: AgentVersion;
  /** Null when the agent version needs none (`runtime.sandboxRequired`). */
  sandbox: Sandbox | null;
  /**
   * The task token (Pistis, token exchange): the service account, limited to
   * the task's project. For the agent's calls to Aether-os; never logged or
   * stored.
   */
  token: string;
  /**
   * The execution's activity log (docs/tasks.md, Activity): the runtime
   * records each model call and tool call into it. Absent: nothing kept.
   */
  activity?: ExecutionActivity;
  /** Where the agent records what it produces (docs/tasks.md, Artifacts). */
  artifacts: ArtifactSink;
  /**
   * For a revision run: the drafts reviewers sent back, each with their
   * comments (`review`). The agent revises each (`revisionOf`). Empty
   * otherwise.
   */
  revisions: ApiTypes.ArtifactResponse[];
  /**
   * After a verification round with failures: the criteria that failed and
   * what their checks said. The agent fixes them (in the same sandbox, with
   * its earlier artifacts kept). Empty on a first run.
   */
  failedChecks: FailedCheck[];
  /**
   * The repository checked out in the sandbox, when the task works in one
   * (docs/git.md): the agent commits there; only commits are kept.
   */
  repository?: AgentRepository | null;
  /**
   * The files the task starts from, copied into the sandbox (Loculus,
   * docs/files.md). Absent or empty without any.
   */
  inputFiles?: AgentInputFile[];
  /**
   * Project knowledge pinned on the task (docs/tasks.md, `context`): reference
   * material for the prompt, at the versions the task got. Absent or empty
   * without any.
   */
  context?: PinnedKnowledge[];
  /**
   * After the task tree's branch moved and the agent's commits conflict
   * with it (docs/git.md): a rebase onto the branch is in progress in the
   * repository, stopped at these conflicts, for the agent to resolve and
   * continue. Absent or null otherwise.
   */
  conflict?: BranchConflict | null;
  /**
   * Aborted when the execution must stop (cancelled, timed out, lost, or
   * Hephaestus shutting down): save what's needed and return quickly.
   */
  signal: AbortSignal;
}

export interface AgentRepository {
  /** `owner/name`. */
  fullName: string;
  /** In the sandbox. */
  path: string;
  /** The task tree's branch, checked out. */
  branch: string;
  /** What it started from: the task branch itself, or the default branch. */
  startedFrom: string;
}

/** A file the task starts from, in the sandbox. */
export interface AgentInputFile {
  path: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface BranchConflict {
  /** The task tree's branch, which moved. */
  branch: string;
  /** Files with conflicts; empty when the rebase applied cleanly. */
  files: string[];
}

export interface FailedCheck {
  key: string;
  description: string;
  output: string;
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
