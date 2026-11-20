import { createHash, randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';

import { ObjectStorage, S3ObjectStorage } from '@loculus/files';

import { asMember, asTask, createApp, type Client } from './app.js';

const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

const PAGE = Buffer.from(
  '<!doctype html><title>Hello</title><marquee>Hello, World!</marquee>',
);

const declare = (bytes: Buffer, extra: Record<string, unknown> = {}) => ({
  fileName: 'index.html',
  contentType: 'text/html',
  sizeBytes: bytes.length,
  sha256: sha256(bytes),
  ...extra,
});

/** Sends bytes to a signed upload, as a client would. */
const put = (
  upload: { url: string; headers: Record<string, string> },
  bytes: Buffer,
  headers: Record<string, string> = {},
) =>
  fetch(upload.url, {
    method: 'PUT',
    body: bytes,
    headers: { ...upload.headers, ...headers },
  });

describe('Files (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let projectId: string;
  let task: Client;
  let files: string;

  beforeEach(async () => {
    app = await createApp();
    orgId = randomUUID();
    projectId = randomUUID();
    task = await asTask(app, orgId, projectId);
    files = `/v1/organizations/${orgId}/projects/${projectId}/files`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('uploads with a signed URL, completes, and downloads as an attachment', async () => {
    const created = await task.post(files).send(declare(PAGE)).expect(201);
    const { file, upload } = created.body;
    expect(file).toEqual({
      id: expect.any(String),
      organizationId: orgId,
      projectId,
      fileName: 'index.html',
      contentType: 'text/html',
      sizeBytes: PAGE.length,
      sha256: sha256(PAGE),
      status: 'pending',
      createdBy: 'sa-1',
      createdAt: expect.any(String),
      completedAt: null,
    });
    expect(upload).toMatchObject({
      method: 'PUT',
      headers: {
        'content-type': 'text/html',
        'x-amz-checksum-sha256': Buffer.from(sha256(PAGE), 'hex').toString(
          'base64',
        ),
      },
      expiresAt: expect.any(String),
    });
    // The object key is Loculus's own, never the file's name.
    expect(upload.url).toContain(
      `/orgs/${orgId}/projects/${projectId}/files/${file.id}?`,
    );

    // Pending: no download yet.
    const early = await task.get(`${files}/${file.id}/download`).expect(409);
    expect(early.body.code).toBe('FILE_NOT_AVAILABLE');

    expect((await put(upload, PAGE)).status).toBe(200);
    const completed = await task
      .post(`${files}/${file.id}/complete`)
      .expect(200);
    expect(completed.body).toMatchObject({
      status: 'available',
      completedAt: expect.any(String),
    });
    // Completing again changes nothing.
    expect(
      (await task.post(`${files}/${file.id}/complete`).expect(200)).body,
    ).toEqual(completed.body);

    // Anyone in the project reads it; downloads are attachments.
    const viewer = await asMember(app, orgId, ['viewer'], {
      [projectId]: 'viewer',
    });
    const link = await viewer.get(`${files}/${file.id}/download`).expect(200);
    expect(link.body).toEqual({
      url: expect.any(String),
      expiresAt: expect.any(String),
    });
    const downloaded = await fetch(link.body.url);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get('content-disposition')).toBe(
      `attachment; filename="index.html"; filename*=UTF-8''index.html`,
    );
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(PAGE);

    expect((await viewer.get(`${files}/${file.id}`).expect(200)).body).toEqual(
      completed.body,
    );
    expect((await viewer.get(files).expect(200)).body).toEqual({
      items: [completed.body],
      nextCursor: null,
    });
    expect(
      (await viewer.get(`${files}?status=pending`).expect(200)).body.items,
    ).toEqual([]);
  });

  it('only accepts the declared bytes, and completes only when they are there', async () => {
    const { file, upload } = (
      await task.post(files).send(declare(PAGE)).expect(201)
    ).body;

    // Nothing uploaded yet.
    const none = await task.post(`${files}/${file.id}/complete`).expect(409);
    expect(none.body).toMatchObject({
      code: 'FILE_UPLOAD_INCOMPLETE',
      detail: expect.stringContaining('nothing was uploaded'),
    });

    // Other bytes of the same size, other bytes of another size, another type.
    const tampered = Buffer.from(PAGE);
    tampered[0] = 0x3e;
    expect((await put(upload, tampered)).ok).toBe(false);
    expect((await put(upload, Buffer.concat([PAGE, PAGE]))).ok).toBe(false);
    expect(
      (await put(upload, PAGE, { 'content-type': 'image/svg+xml' })).ok,
    ).toBe(false);
    await task.post(`${files}/${file.id}/complete`).expect(409);

    // A fresh upload while it's pending; then it's done.
    const again = await task.get(`${files}/${file.id}/upload`).expect(200);
    expect((await put(again.body, PAGE)).status).toBe(200);
    await task.post(`${files}/${file.id}/complete`).expect(200);
    const late = await task.get(`${files}/${file.id}/upload`).expect(409);
    expect(late.body.code).toBe('FILE_NOT_PENDING');
  });

  it('refuses files it would not keep', async () => {
    const big = await task
      .post(files)
      .send(declare(PAGE, { sizeBytes: 2 * 1024 * 1024 }))
      .expect(409);
    expect(big.body.code).toBe('FILE_TOO_LARGE');
    for (const fileName of ['../index.html', 'a/b.html', 'a\\b', 'a\nb', '']) {
      await task.post(files).send(declare(PAGE, { fileName })).expect(400);
    }
    await task
      .post(files)
      .send(declare(PAGE, { sha256: 'not-a-hash' }))
      .expect(400);
    await task
      .post(files)
      .send(declare(PAGE, { contentType: 'html' }))
      .expect(400);
    await task
      .post(files)
      .send({ ...declare(PAGE), objectKey: 'orgs/x' })
      .expect(400);
  });

  it('keeps files to their project and checks permissions', async () => {
    const { file } = (await task.post(files).send(declare(PAGE)).expect(201))
      .body;

    // A viewer reads but doesn't write; no role in the project is a 404.
    const viewer = await asMember(app, orgId, ['viewer'], {
      [projectId]: 'viewer',
    });
    await viewer.get(`${files}/${file.id}`).expect(200);
    await viewer.post(files).send(declare(PAGE)).expect(403);
    await viewer.delete(`${files}/${file.id}`).expect(403);
    const outsider = await asMember(app, orgId, ['member']);
    await outsider.get(`${files}/${file.id}`).expect(404);

    // Another project's route doesn't find it, nor does a task elsewhere.
    const otherProject = randomUUID();
    const owner = await asMember(app, orgId, ['owner']);
    await owner
      .get(
        `/v1/organizations/${orgId}/projects/${otherProject}/files/${file.id}`,
      )
      .expect(404);
    const otherTask = await asTask(app, orgId, otherProject);
    await otherTask.get(`${files}/${file.id}`).expect(404);
    // Another organization's token.
    const stranger = await asMember(app, randomUUID(), ['owner']);
    await stranger.get(`${files}/${file.id}`).expect(404);
  });

  it('deletes the file and its object', async () => {
    const { file, upload } = (
      await task.post(files).send(declare(PAGE)).expect(201)
    ).body;
    await put(upload, PAGE);
    await task.post(`${files}/${file.id}/complete`).expect(200);
    const { url } = (await task.get(`${files}/${file.id}/download`).expect(200))
      .body;

    await task.delete(`${files}/${file.id}`).expect(204);
    await task.delete(`${files}/${file.id}`).expect(204);
    await task.get(`${files}/${file.id}`).expect(404);
    expect(
      await app
        .get(ObjectStorage)
        .inspect(`orgs/${orgId}/projects/${projectId}/files/${file.id}`),
    ).toBeNull();
    // A link given out before is dead too.
    expect((await fetch(url)).status).toBe(404);
  });

  it("says so when the object store doesn't answer", async () => {
    await app.close();
    app = await createApp((builder) =>
      builder.overrideProvider(ObjectStorage).useValue(
        new S3ObjectStorage({
          endpoint: 'http://127.0.0.1:9',
          region: 'us-east-1',
          bucket: 'loculus-test',
          credentials: { accessKeyId: 'x', secretAccessKey: 'y' },
          forcePathStyle: true,
        }),
      ),
    );
    task = await asTask(app, orgId, projectId);
    // Signing needs no store; checking it does.
    const { file } = (await task.post(files).send(declare(PAGE)).expect(201))
      .body;
    const down = await task.post(`${files}/${file.id}/complete`).expect(503);
    expect(down.body.detail).toContain("the object store isn't answering");
  });
});
