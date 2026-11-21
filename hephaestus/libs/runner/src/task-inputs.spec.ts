import type { TaskResponse } from '@hephaestus/tasks';

import {
  FileStore,
  FileStoreError,
  type FetchedFile,
  type StoredFile,
} from './file-store.js';
import { RunnerFailure } from './runner.errors.js';
import type { Sandbox } from './sandbox-provisioner.js';
import { inputNames, TaskInputs } from './task-inputs.js';

class FilesById extends FileStore {
  readonly available = true;
  constructor(
    private readonly files: Record<string, FetchedFile | FileStoreError>,
  ) {
    super();
  }
  store(): Promise<StoredFile> {
    throw new Error('not used');
  }
  fetch(_task: TaskResponse, _token: string, fileId: string) {
    const file = this.files[fileId];
    return file instanceof FileStoreError
      ? Promise.reject(file)
      : Promise.resolve(file);
  }
}

const file = (fileName: string, content: string): FetchedFile => ({
  fileName,
  contentType: 'text/plain',
  bytes: Buffer.from(content),
});

const taskWith = (...fileIds: string[]) =>
  ({ inputFiles: fileIds.map((fileId) => ({ fileId })) }) as TaskResponse;

function recordingSandbox() {
  const written: { path: string; content: string }[] = [];
  const sandbox: Sandbox = {
    reference: {},
    exec: (command, options) => {
      written.push({
        path: command.at(-1)!,
        content: options?.stdin?.toString() ?? '',
      });
      return Promise.resolve({
        exitCode: 0,
        stdout: Buffer.alloc(0),
        stderr: '',
      });
    },
  };
  return { sandbox, written };
}

const noTasks = { pinnedContext: () => Promise.resolve([]) };

describe('TaskInputs', () => {
  it('names files apart in one directory', () => {
    expect(
      inputNames(['brief.md', 'brief.md', '../x/brief.md', 'data', 'data']),
    ).toEqual(['brief.md', 'brief-2.md', 'brief-3.md', 'data', 'data-2']);
  });

  it('copies the files into /workspace/inputs and says where they are', async () => {
    const inputs = new TaskInputs(
      new FilesById({
        a: file('brief.md', '# Brief'),
        b: file('brief.md', 'v2'),
      }),
      1024,
      noTasks,
    );
    const { sandbox, written } = recordingSandbox();
    expect(await inputs.copyInto(taskWith('a', 'b'), 'token', sandbox)).toEqual(
      [
        {
          path: '/workspace/inputs/brief.md',
          fileName: 'brief.md',
          contentType: 'text/plain',
          sizeBytes: 7,
        },
        {
          path: '/workspace/inputs/brief-2.md',
          fileName: 'brief.md',
          contentType: 'text/plain',
          sizeBytes: 2,
        },
      ],
    );
    expect(written).toEqual([
      { path: '/workspace/inputs/brief.md', content: '# Brief' },
      { path: '/workspace/inputs/brief-2.md', content: 'v2' },
    ]);
    // None, nothing to do (and no sandbox needed).
    expect(await inputs.copyInto(taskWith(), 'token', null)).toEqual([]);
  });

  it('fails the execution, retrying only when Loculus was unreachable', async () => {
    const inputs = new TaskInputs(
      new FilesById({
        gone: new FileStoreError('Loculus refused the file: not found'),
        down: new FileStoreError('Loculus could not be reached', true),
      }),
      1024,
      noTasks,
    );
    const { sandbox } = recordingSandbox();
    await expect(
      inputs.copyInto(taskWith('gone'), 'token', sandbox),
    ).rejects.toMatchObject({ retryable: false });
    await expect(
      inputs.copyInto(taskWith('down'), 'token', sandbox),
    ).rejects.toMatchObject({ retryable: true });
    const noSandbox = inputs.copyInto(taskWith('gone'), 'token', null);
    await expect(noSandbox).rejects.toBeInstanceOf(RunnerFailure);
    await expect(noSandbox).rejects.toThrow('runs without one');
  });
});
