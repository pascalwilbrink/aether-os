import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A request a fake provider received. */
export interface ReceivedRequest {
  path: string;
  headers: IncomingMessage['headers'];
  body: Record<string, unknown>;
}

/** An answer to give instead of the provider's usual one. */
export interface ScriptedAnswer {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Anthropic, OpenAI (Chat Completions, Responses, embeddings), Mistral,
 * Google and an Ollama server in the test process, on one local port
 * (`*_API_URL` point at it; an organization's Ollama `baseUrl` too). Each
 * answers like the real API, with fixed usage, streamed when asked;
 * `script` queues other answers (errors, 429s), `received` records every
 * request.
 */
export class FakeProviders {
  readonly received: ReceivedRequest[] = [];
  readonly script: ScriptedAnswer[] = [];
  private server!: Server;
  url = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let data = '';
      req.on('data', (chunk: Buffer) => (data += chunk.toString()));
      req.on('end', () => {
        const body = data ? (JSON.parse(data) as Record<string, unknown>) : {};
        const path = req.url ?? '';
        this.received.push({ path, headers: req.headers, body });
        const scripted = this.script.shift();
        if (scripted) {
          res.writeHead(scripted.status, {
            'content-type': 'application/json',
            ...scripted.headers,
          });
          res.end(
            scripted.body === undefined ? '' : JSON.stringify(scripted.body),
          );
          return;
        }
        const answer = answerFor(path, body);
        if (!answer) {
          res.writeHead(404).end();
          return;
        }
        if (Array.isArray(answer)) {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'request-id': 'req-1',
          });
          for (const event of answer) {
            res.write(event);
          }
          res.end();
          return;
        }
        res.writeHead(200, {
          'content-type': 'application/json',
          'request-id': 'req-1',
        });
        res.end(JSON.stringify(answer));
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  reset(): void {
    this.received.length = 0;
    this.script.length = 0;
  }

  last(): ReceivedRequest {
    const request = this.received.at(-1);
    if (!request) throw new Error('No provider request yet');
    return request;
  }
}

const sse = (data: unknown, event?: string) =>
  `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`;

/** The usual answer for a route, a list of events for a stream, or null. */
function answerFor(
  path: string,
  body: Record<string, unknown>,
): unknown[] | object | null {
  const stream = body.stream === true;
  if (path === '/v1/messages') {
    const usage = {
      input_tokens: 10,
      cache_creation_input_tokens: 2,
      cache_read_input_tokens: 5,
      output_tokens: 7,
    };
    if (!stream) {
      return {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        stop_reason: 'end_turn',
        usage,
      };
    }
    return [
      sse(
        {
          type: 'message_start',
          message: { id: 'msg_1', usage: { ...usage, output_tokens: 1 } },
        },
        'message_start',
      ),
      sse(
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hel' },
        },
        'content_block_delta',
      ),
      sse(
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'lo' },
        },
        'content_block_delta',
      ),
      sse(
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 7 },
        },
        'message_delta',
      ),
      sse({ type: 'message_stop' }, 'message_stop'),
    ];
  }
  if (path === '/v1/chat/completions') {
    const usage = {
      prompt_tokens: 20,
      completion_tokens: 4,
      prompt_tokens_details: { cached_tokens: 8 },
    };
    if (!stream) {
      return {
        id: 'chatcmpl-1',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hi' },
            finish_reason: 'stop',
          },
        ],
        usage,
      };
    }
    const options = body.stream_options as
      { include_usage?: boolean } | undefined;
    return [
      sse({ id: 'c1', choices: [{ index: 0, delta: { content: 'Hi' } }] }),
      sse({
        id: 'c1',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
      ...(options?.include_usage
        ? [sse({ id: 'c1', choices: [], usage })]
        : []),
      'data: [DONE]\n\n',
    ];
  }
  if (path === '/v1/responses') {
    const response = {
      id: 'resp_1',
      status: 'completed',
      usage: {
        input_tokens: 30,
        output_tokens: 6,
        input_tokens_details: { cached_tokens: 10 },
      },
    };
    return stream
      ? [
          sse(
            { type: 'response.output_text.delta', delta: 'Hi' },
            'response.output_text.delta',
          ),
          sse({ type: 'response.completed', response }, 'response.completed'),
        ]
      : response;
  }
  const google =
    /^\/v1beta\/models\/[^:]+:(generateContent|streamGenerateContent)/.exec(
      path,
    );
  if (google) {
    const chunk = (text: string, last: boolean) => ({
      candidates: [
        {
          content: { parts: [{ text }] },
          ...(last ? { finishReason: 'STOP' } : {}),
        },
      ],
      usageMetadata: {
        promptTokenCount: 12,
        candidatesTokenCount: last ? 5 : 2,
        thoughtsTokenCount: last ? 3 : 0,
      },
    });
    return google[1] === 'streamGenerateContent'
      ? [sse(chunk('Hel', false)), sse(chunk('lo', true))]
      : chunk('Hello', true);
  }
  if (path === '/v1/embeddings') {
    const inputs = body.input as string[];
    return {
      object: 'list',
      data: inputs
        .map((_, index) => ({
          object: 'embedding',
          index,
          embedding: [index, 0.5, 0.25],
        }))
        .reverse(),
      usage: { prompt_tokens: inputs.length * 4 },
    };
  }
  return null;
}

/** The run's providers, started by test/setup.ts. */
export const providers = new FakeProviders();
