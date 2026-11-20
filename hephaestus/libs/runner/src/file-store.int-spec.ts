import { createHash } from 'node:crypto';

import type { TaskResponse } from '@hephaestus/tasks';

import { FakeLoculus } from '../../../test/fake-loculus.js';
import { FileStoreError, LoculusFileStore } from './file-store.js';

describe('LoculusFileStore (a stand-in Loculus)', () => {
  let loculus: FakeLoculus;
  const task = {
    id: 'task-1',
    organizationId: '0195f2a0-0000-7000-8000-000000000001',
    projectId: '0195f2a0-0000-7000-8000-000000000002',
  } as TaskResponse;

  beforeEach(async () => {
    loculus = await new FakeLoculus().start();
  });
  afterEach(async () => {
    await loculus.stop();
  });

  it('declares, uploads and completes a file as the task', async () => {
    const stored = await new LoculusFileStore(loculus.url).store(
      task,
      'task-token',
      {
        fileName: 'index.html',
        contentType: 'text/html',
        bytes: Buffer.from('<h1>Hi</h1>'),
      },
    );
    expect(stored).toEqual({
      fileId: expect.any(String),
      fileName: 'index.html',
      contentType: 'text/html',
      sizeBytes: 11,
      sha256: createHash('sha256').update('<h1>Hi</h1>').digest('hex'),
    });
    const file = loculus.files.get(stored.fileId)!;
    expect(file).toMatchObject({
      organizationId: task.organizationId,
      projectId: task.projectId,
      status: 'available',
      bytes: Buffer.from('<h1>Hi</h1>'),
    });
    expect(loculus.requests).toEqual([
      {
        method: 'POST',
        path: `/v1/organizations/${task.organizationId}/projects/${task.projectId}/files`,
        authorization: 'Bearer task-token',
      },
      {
        method: 'POST',
        path: `/v1/organizations/${task.organizationId}/projects/${task.projectId}/files/${stored.fileId}/complete`,
        authorization: 'Bearer task-token',
      },
    ]);
  });

  it('says what Loculus said, or that it is gone', async () => {
    loculus.refuse = 403;
    const store = new LoculusFileStore(loculus.url);
    const file = {
      fileName: 'a.txt',
      contentType: 'text/plain',
      bytes: Buffer.from('a'),
    };
    await expect(store.store(task, 'token', file)).rejects.toThrow(
      new FileStoreError('Loculus refused the file: Refused by the test.'),
    );
    await loculus.stop();
    await expect(store.store(task, 'token', file)).rejects.toThrow(
      'Loculus could not be reached',
    );
    loculus = await new FakeLoculus().start();
  });
});
