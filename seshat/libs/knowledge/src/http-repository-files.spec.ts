import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ServiceTokens } from '@seshat/core';

import { DocumentFileError } from './document-files.js';
import { HttpRepositoryFiles } from './http-repository-files.js';
import {
  gitBlobSha,
  repositoryContentType,
  RepositoryFilesError,
  underAnyPath,
} from './repository-files.js';

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
const linkId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';
const base = `/v1/organizations/${orgId}/projects/${projectId}/repositories/${linkId}`;
const content = Buffer.from('# Notes\n\nHello.');
const sha = gitBlobSha(content);

describe('HttpRepositoryFiles', () => {
  let server: Server;
  let routes: Record<string, { status: number; body?: unknown }[]>;
  let requests: { url?: string; authorization?: string }[];
  let tokens: FixedTokens;
  let files: HttpRepositoryFiles;

  beforeEach(async () => {
    routes = {};
    requests = [];
    server = createServer((req, res) => {
      requests.push({ url: req.url, authorization: req.headers.authorization });
      const answer = routes[req.url ?? '']?.shift() ?? { status: 404 };
      if (Buffer.isBuffer(answer.body)) {
        res.writeHead(answer.status, {
          'content-type': 'application/octet-stream',
        });
        res.end(answer.body);
        return;
      }
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(answer.body === undefined ? '' : JSON.stringify(answer.body));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    tokens = new FixedTokens();
    files = new HttpRepositoryFiles({ baseUrl }, tokens);
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const listing = {
    fullName: 'acme/api',
    defaultBranch: 'main',
    commit: 'c'.repeat(40),
    truncated: false,
    files: [
      {
        path: 'docs/a.md',
        sha,
        sizeBytes: content.byteLength,
        url: 'https://github.com/acme/api/blob/c/docs/a.md',
      },
    ],
  };

  it('lists files under the paths with its own token, null for a link that is not the project’s', async () => {
    const url = `${base}/files?path=docs%2F&path=README.md`;
    routes[url] = [{ status: 200, body: listing }, { status: 404 }];
    await expect(
      files.list(orgId, projectId, linkId, ['docs/', 'README.md']),
    ).resolves.toEqual({
      fullName: 'acme/api',
      commit: 'c'.repeat(40),
      truncated: false,
      files: listing.files,
    });
    expect(requests[0]).toEqual({ url, authorization: 'Bearer token-1' });
    await expect(
      files.list(orgId, projectId, linkId, ['docs/', 'README.md']),
    ).resolves.toBeNull();
  });

  it('renews a refused token once; 5xx is retryable, 400 is not', async () => {
    const url = `${base}/files?path=docs%2F`;
    routes[url] = [
      { status: 401 },
      { status: 200, body: listing },
      { status: 503, body: { detail: 'GitHub is down' } },
      { status: 503 },
      { status: 400 },
    ];
    await files.list(orgId, projectId, linkId, ['docs/']);
    expect(tokens.invalidated).toBe(1);

    const unavailable = await files
      .list(orgId, projectId, linkId, ['docs/'])
      .catch((error: unknown) => error);
    expect(unavailable).toBeInstanceOf(RepositoryFilesError);
    expect(unavailable).toMatchObject({
      retryable: true,
      message: 'Proxenos answered 503: GitHub is down',
    });
    routes[url].shift(); // the second 503
    await expect(
      files.list(orgId, projectId, linkId, ['docs/']),
    ).rejects.toMatchObject({ retryable: false });
  });

  it('reads a blob and checks it against its SHA', async () => {
    routes[`${base}/blobs/${sha}`] = [
      { status: 200, body: content },
      { status: 200, body: Buffer.from('something else') },
      { status: 404 },
    ];
    const blob = { sha, sizeBytes: content.byteLength };
    const bytes = await files.read(orgId, projectId, linkId, blob);
    expect(Buffer.from(bytes).toString()).toBe(content.toString());

    await expect(
      files.read(orgId, projectId, linkId, blob),
    ).rejects.toMatchObject({
      constructor: DocumentFileError,
      retryable: false,
    });
    await expect(
      files.read(orgId, projectId, linkId, blob),
    ).rejects.toMatchObject({ retryable: false });
  });
});

describe('repository files', () => {
  it("has Git's blob SHA", () => {
    // `git hash-object` of "hello\n".
    expect(gitBlobSha(Buffer.from('hello\n'))).toBe(
      'ce013625030ba8dba906f756967f9e9ca394464a',
    );
  });

  it('indexes documents by type, never code or images', () => {
    expect(repositoryContentType('docs/a.md')).toBe('text/markdown');
    expect(repositoryContentType('adr/0001.MDX')).toBe('text/markdown');
    expect(repositoryContentType('specs/api.pdf')).toBe('application/pdf');
    expect(repositoryContentType('notes.txt')).toBe('text/plain');
    expect(repositoryContentType('src/index.ts')).toBeNull();
    expect(repositoryContentType('docs/diagram.png')).toBeNull();
    expect(repositoryContentType('LICENSE')).toBeNull();
  });

  it('takes files under folders and exact files', () => {
    const paths = ['docs/', 'README.md'];
    expect(underAnyPath('docs/a/b.md', paths)).toBe(true);
    expect(underAnyPath('README.md', paths)).toBe(true);
    expect(underAnyPath('docsy/a.md', paths)).toBe(false);
    expect(underAnyPath('sub/README.md', paths)).toBe(false);
  });
});
