import { posix } from 'node:path';

import type {
  PinnedKnowledge,
  TaskResponse,
  TasksService,
} from '@hephaestus/tasks';

import type { AgentInputFile } from './agent-runtime.js';
import { FileStore, FileStoreError } from './file-store.js';
import { RunnerFailure } from './runner.errors.js';
import { fileNameOf } from './sandbox-files.js';
import type { Sandbox } from './sandbox-provisioner.js';

/** Where a task's input files are in its sandbox. */
export const INPUTS_DIRECTORY = '/workspace/inputs';

/**
 * Names for files in one directory: each file's own, made safe, with `-2`,
 * `-3`… before the extension when two would collide.
 */
export function inputNames(fileNames: string[]): string[] {
  const taken = new Set<string>();
  return fileNames.map((name) => {
    const safe = fileNameOf(name);
    const extension = posix.extname(safe);
    const stem = safe.slice(0, safe.length - extension.length);
    let candidate = safe;
    for (let n = 2; taken.has(candidate); n++) {
      candidate = `${stem}-${n}${extension}`;
    }
    taken.add(candidate);
    return candidate;
  });
}

/**
 * The files a task starts from (docs/files.md), copied from Loculus (with
 * the task's token) into its sandbox's `/workspace/inputs` before the agent
 * runs, through `exec` (the sandbox has no network). A file that's gone,
 * not uploaded or too large fails the execution without retrying; Loculus
 * or the storage not answering is retried.
 */
export class TaskInputs {
  constructor(
    private readonly files: FileStore,
    private readonly maxBytes: number,
    private readonly tasks: Pick<TasksService, 'pinnedContext'>,
  ) {}

  /** The knowledge pinned on the task, at the versions it got (docs/tasks.md, `context`). */
  context(task: TaskResponse): Promise<PinnedKnowledge[]> {
    if (task.context.length === 0) return Promise.resolve([]);
    return this.tasks.pinnedContext(task.organizationId, task.id);
  }

  async copyInto(
    task: TaskResponse,
    token: string,
    sandbox: Sandbox | null,
  ): Promise<AgentInputFile[]> {
    if (task.inputFiles.length === 0) {
      return [];
    }
    if (!sandbox?.exec) {
      throw new RunnerFailure(
        "The task's input files go into its sandbox, and its agent version runs without one (runtime.sandboxRequired)",
        'infrastructure',
        false,
      );
    }
    const fetched = [];
    for (const { fileId } of task.inputFiles) {
      try {
        fetched.push(
          await this.files.fetch(task, token, fileId, this.maxBytes),
        );
      } catch (error) {
        if (error instanceof FileStoreError) {
          throw new RunnerFailure(
            `An input file can't be read: ${error.message}`,
            'infrastructure',
            error.retryable,
          );
        }
        throw error;
      }
    }
    const names = inputNames(fetched.map((file) => file.fileName));
    const copied: AgentInputFile[] = [];
    for (const [index, file] of fetched.entries()) {
      const path = `${INPUTS_DIRECTORY}/${names[index]}`;
      const result = await sandbox.exec(
        [
          'sh',
          '-c',
          'mkdir -p "$1" && cat > "$2"',
          'sh',
          INPUTS_DIRECTORY,
          path,
        ],
        { stdin: file.bytes, timeoutMs: 60_000 },
      );
      if (result.exitCode !== 0) {
        throw new RunnerFailure(
          `An input file couldn't be written into the sandbox: ${result.stderr.trim() || `exit code ${result.exitCode}`}`,
          'infrastructure',
        );
      }
      copied.push({
        path,
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.bytes.length,
      });
    }
    return copied;
  }
}
