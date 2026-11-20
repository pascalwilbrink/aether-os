import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ServiceTokens } from '@seshat/core';

import { DocumentFileError } from './document-files.js';
import { HttpDocumentFiles } from './http-document-files.js';

class FixedTokens extends ServiceTokens {
  issued = 0;
  invalidated = 0;
  token(): Promise<string> {
    this.issued++;
    return Promise.resolve(`token-${this.issued}`);
  }
  invalidate(): void {
    this.invalidated++;
  }
}

const orgId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const projectId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const fileId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';
const filePath = `/v1/organizations/${orgId}/projects/${projectId}/files/${fileId}`;
const content = Buffer.from('# Notes\n\nHello.');
const sha256 = createHash('sha256').update(content).digest('hex');

describe('HttpDocumentFiles', () => {
  let server: Server;
  let baseUrl: string;
  let routes: Record<string, { status: number; body?: unknown }[]>;
  let requests: { url?: string; authorization?: string }[];
  let tokens: FixedTokens;
  let files: HttpDocumentFiles;

  beforeEach(async () => {
    routes = {};
    requests = [];
    server = createServer((req, res) => {
      requests.push({ url: req.url, authorization: req.headers.authorization });
      if (req.url === '/blob') {
        res.writeHead(200, { 'content-type': 'text/markdown' });
        res.end(content);
        return;
      }
      const answer = routes[req.url ?? '']?.shift() ?? { status: 404 };
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(answer.body === undefined ? '' : JSON.stringify(answer.body));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    tokens = new FixedTokens();
    files = new HttpDocumentFiles({ baseUrl }, tokens);
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const file = {
    id: fileId,
    organizationId: orgId,
    projectId,
    fileName: 'notes.md',
    contentType: 'text/markdown',
    sizeBytes: content.byteLength,
    sha256,
    status: 'available',
  };

  it("describes a file with Seshat's own token, renewing a refused one once", async () => {
    routes[filePath] = [{ status: 401 }, { status: 200, body: file }];

    await expect(files.describe(orgId, projectId, fileId)).resolves.toEqual({
      id: fileId,
      fileName: 'notes.md',
      contentType: 'text/markdown',
      sizeBytes: content.byteLength,
      sha256,
      status: 'available',
    });
    expect(tokens.invalidated).toBe(1);
    expect(requests.map((r) => r.authorization)).toEqual([
      'Bearer token-1',
      'Bearer token-2',
    ]);
  });

  it("is null for a file Loculus doesn't have", async () => {
    await expect(files.describe(orgId, projectId, fileId)).resolves.toBeNull();
  });

  it("reads a file's bytes through a fresh download URL and checks them", async () => {
    routes[`${filePath}/download`] = [
      { status: 200, body: { url: `${baseUrl}/blob`, expiresAt: 'x' } },
      { status: 200, body: { url: `${baseUrl}/blob`, expiresAt: 'x' } },
    ];

    const bytes = await files.read(orgId, projectId, file);
    expect(Buffer.from(bytes).toString()).toBe(content.toString());

    const read = files.read(orgId, projectId, {
      ...file,
      sha256: '0'.repeat(64),
    });
    await expect(read).rejects.toBeInstanceOf(DocumentFileError);
    await expect(read).rejects.toMatchObject({ retryable: false });
  });

  it('tells a retryable failure from a final one', async () => {
    routes[`${filePath}/download`] = [{ status: 503 }, { status: 404 }];

    await expect(files.read(orgId, projectId, file)).rejects.toMatchObject({
      retryable: true,
    });
    await expect(files.read(orgId, projectId, file)).rejects.toMatchObject({
      retryable: false,
    });

    const unreachable = new HttpDocumentFiles(
      { baseUrl: 'http://127.0.0.1:1' },
      tokens,
    );
    await expect(
      unreachable.describe(orgId, projectId, fileId),
    ).rejects.toMatchObject({ retryable: true });
  });
});
