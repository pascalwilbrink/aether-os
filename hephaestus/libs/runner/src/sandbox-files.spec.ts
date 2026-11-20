import type { TaskResponse } from '@hephaestus/tasks';

import { FileStore, FileStoreError, type FileToStore } from './file-store.js';
import { contentTypeOf, fileNameOf, SandboxFiles } from './sandbox-files.js';
import type { Sandbox } from './sandbox-provisioner.js';

class RecordingStore extends FileStore {
  readonly available = true;
  readonly stored: FileToStore[] = [];

  store(_task: TaskResponse, _token: string, file: FileToStore) {
    this.stored.push(file);
    return Promise.resolve({
      fileId: 'file-1',
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.bytes.length,
      sha256: 'a'.repeat(64),
    });
  }
}

/** A sandbox whose files are in memory; `head -c` as the script would. */
function sandboxWith(files: Record<string, string>) {
  const commands: string[][] = [];
  const sandbox: Sandbox = {
    reference: {},
    exec: (command) => {
      commands.push(command);
      const [, , , , path, limit] = command;
      const content = files[path];
      return Promise.resolve(
        content === undefined
          ? { exitCode: 3, stdout: Buffer.alloc(0), stderr: 'not a file' }
          : {
              exitCode: 0,
              stdout: Buffer.from(content).subarray(0, Number(limit)),
              stderr: '',
            },
      );
    },
  };
  return { sandbox, commands };
}

const task = { id: 'task-1' } as TaskResponse;

describe('SandboxFiles', () => {
  it('reads a file from the workspace and keeps it, typed by its name', async () => {
    const store = new RecordingStore();
    const { sandbox, commands } = sandboxWith({
      '/workspace/site/index.html': '<h1>Hi</h1>',
    });
    const artifact = await new SandboxFiles(store, 1024).submit(
      sandbox,
      task,
      'token',
      { path: 'site/index.html', title: 'Homepage', primary: true },
    );
    expect(commands[0].slice(4)).toEqual([
      '/workspace/site/index.html',
      '1025',
    ]);
    expect(store.stored).toEqual([
      {
        fileName: 'index.html',
        contentType: 'text/html',
        bytes: Buffer.from('<h1>Hi</h1>'),
      },
    ]);
    expect(artifact).toEqual({
      kind: 'file',
      title: 'Homepage',
      primary: true,
      revisionOf: undefined,
      fileId: 'file-1',
      fileName: 'index.html',
      contentType: 'text/html',
      sizeBytes: 11,
      sha256: 'a'.repeat(64),
    });
  });

  it('refuses what it would not keep', async () => {
    const files = new SandboxFiles(new RecordingStore(), 4);
    const { sandbox } = sandboxWith({ '/tmp/big.txt': 'hello' });
    await expect(
      files.submit(sandbox, task, 'token', {
        path: '/tmp/big.txt',
        title: 'Big',
      }),
    ).rejects.toThrow(
      new FileStoreError(
        '/tmp/big.txt is larger than 4 bytes, the most a file artifact can be.',
      ),
    );
    await expect(
      files.submit(sandbox, task, 'token', { path: 'gone.txt', title: 'Gone' }),
    ).rejects.toThrow('/workspace/gone.txt is not a file in your sandbox.');
    const { sandbox: small } = sandboxWith({ '/workspace/a': 'a' });
    await expect(
      files.submit(small, task, 'token', {
        path: 'a',
        title: 'A',
        contentType: 'html',
      }),
    ).rejects.toThrow('contentType must be a media type');
    await expect(
      files.submit({ reference: {} }, task, 'token', { path: 'a', title: 'A' }),
    ).rejects.toThrow(FileStoreError);
  });

  it('names and types files as Loculus takes them', () => {
    expect(fileNameOf('../../etc/passwd')).toBe('passwd');
    expect(fileNameOf('a\\b\nc.txt')).toBe('a_b_c.txt');
    expect(fileNameOf('/')).toBe('file');
    expect(contentTypeOf('report.PDF')).toBe('application/pdf');
    expect(contentTypeOf('logo.svg')).toBe('image/svg+xml');
    expect(contentTypeOf('Makefile')).toBe('application/octet-stream');
  });
});
