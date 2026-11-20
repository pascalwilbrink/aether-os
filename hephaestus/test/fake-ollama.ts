import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in Ollama server on a free local port: `GET /api/tags` lists its
 * models, `POST /v1/chat/completions` (the OpenAI-compatible API) answers
 * `reply`. Keeps each request's method, path, headers and body.
 */
export class FakeOllama {
  readonly requests: {
    method: string;
    path: string;
    headers: IncomingHttpHeaders;
    body: unknown;
  }[] = [];
  models = [
    { name: 'qwen3:8b', size: 5_200_000_000 },
    { name: 'llama3.2:latest', size: 2_000_000_000 },
  ];
  reply = 'Hello from Ollama.';
  private server?: Server;

  get url(): string {
    const { port } = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
        this.requests.push({
          method: req.method ?? '',
          path: req.url ?? '',
          headers: req.headers,
          body,
        });
        if (req.method === 'GET' && req.url === '/api/tags') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ models: this.models }));
          return;
        }
        if (req.method === 'POST' && req.url === '/v1/chat/completions') {
          this.complete(body ?? {}, res);
          return;
        }
        res.statusCode = 404;
        res.end();
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private complete(
    body: Record<string, unknown>,
    res: import('node:http').ServerResponse,
  ) {
    const base = {
      id: 'chatcmpl-1',
      created: 1_800_000_000,
      model: body.model,
    };
    const usage = { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 };
    if (body.stream) {
      res.setHeader('content-type', 'text/event-stream');
      const send = (data: unknown) =>
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      send({
        ...base,
        object: 'chat.completion.chunk',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: this.reply },
            finish_reason: null,
          },
        ],
      });
      send({
        ...base,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage,
      });
      res.end('data: [DONE]\n\n');
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        ...base,
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: this.reply },
            finish_reason: 'stop',
          },
        ],
        usage,
      }),
    );
  }
}
