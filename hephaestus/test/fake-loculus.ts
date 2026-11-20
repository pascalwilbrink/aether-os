import { createHash, randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

interface FakeFile {
  id: string;
  organizationId: string;
  projectId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  status: 'pending' | 'available';
  bytes: Buffer | null;
}

/**
 * A stand-in Loculus (../loculus, docs/files.md) on a free local port:
 * declaring a file answers an upload URL on itself, which only takes the
 * declared bytes (type and SHA-256 checked, as the storage does), and
 * completing makes it available once they're there. Keeps each API
 * request's method, path and `authorization`, and the files.
 */
export class FakeLoculus {
  readonly requests: {
    method: string;
    path: string;
    authorization?: string;
  }[] = [];
  readonly files = new Map<string, FakeFile>();
  /** Answers every API call with this status instead (e.g. 403). */
  refuse: number | null = null;
  private server?: Server;

  get url(): string {
    const { port } = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => this.handle(req, Buffer.concat(chunks), res));
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private handle(req: IncomingMessage, body: Buffer, res: ServerResponse) {
    const path = req.url ?? '';
    const upload = /^\/upload\/([0-9a-f-]+)$/.exec(path);
    if (req.method === 'PUT' && upload) {
      const file = this.files.get(upload[1]);
      const checksum = createHash('sha256').update(body).digest('base64');
      if (
        !file ||
        req.headers['content-type'] !== file.contentType ||
        req.headers['x-amz-checksum-sha256'] !== checksum ||
        Buffer.from(checksum, 'base64').toString('hex') !== file.sha256
      ) {
        res.statusCode = 400;
        res.end();
        return;
      }
      file.bytes = body;
      res.end();
      return;
    }
    this.requests.push({
      method: req.method ?? '',
      path,
      authorization: req.headers.authorization,
    });
    if (this.refuse) {
      return this.problem(res, this.refuse, 'Refused by the test.');
    }
    const files =
      /^\/v1\/organizations\/([^/]+)\/projects\/([^/]+)\/files(?:\/([^/]+)\/complete)?$/.exec(
        path,
      );
    if (req.method === 'POST' && files && !files[3]) {
      const declared = JSON.parse(body.toString()) as Pick<
        FakeFile,
        'fileName' | 'contentType' | 'sizeBytes' | 'sha256'
      >;
      const file: FakeFile = {
        id: randomUUID(),
        organizationId: files[1],
        projectId: files[2],
        ...declared,
        status: 'pending',
        bytes: null,
      };
      this.files.set(file.id, file);
      return this.json(res, 201, {
        file: this.response(file),
        upload: {
          url: `${this.url}/upload/${file.id}`,
          method: 'PUT',
          headers: {
            'content-type': file.contentType,
            'x-amz-checksum-sha256': Buffer.from(file.sha256, 'hex').toString(
              'base64',
            ),
          },
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        },
      });
    }
    if (req.method === 'POST' && files?.[3]) {
      const file = this.files.get(files[3]);
      if (!file?.bytes) {
        return this.problem(res, 409, 'Nothing was uploaded.');
      }
      file.status = 'available';
      return this.json(res, 200, this.response(file));
    }
    res.statusCode = 404;
    res.end();
  }

  private response(file: FakeFile) {
    const { bytes: _bytes, ...rest } = file;
    return {
      ...rest,
      createdBy: 'sa-1',
      createdAt: new Date().toISOString(),
      completedAt:
        file.status === 'available' ? new Date().toISOString() : null,
    };
  }

  private json(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  }

  private problem(res: ServerResponse, status: number, detail: string) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/problem+json');
    res.end(JSON.stringify({ status, title: 'Problem', detail }));
  }
}
