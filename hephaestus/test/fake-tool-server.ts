import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { MCPServer } from '@mastra/mcp';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * A real MCP server (Streamable HTTP, Mastra's) on a free local port, for
 * tests: `lookup` answers what it's asked, `shout` uppercases. Keeps the
 * headers of every request, to check what Hephaestus sends.
 */
export class FakeToolServer {
  readonly requests: IncomingHttpHeaders[] = [];
  /** Answer 401 to everything (a wrong credential). */
  refuse = false;
  private http?: Server;
  private mcp?: MCPServer;

  get url(): string {
    const { port } = this.http!.address() as AddressInfo;
    return `http://127.0.0.1:${port}/mcp`;
  }

  async start(): Promise<this> {
    this.mcp = new MCPServer({
      id: 'fake-tools',
      name: 'Fake tools',
      version: '1.0.0',
      tools: {
        lookup: createTool({
          id: 'lookup',
          description: 'Looks a term up',
          inputSchema: z.object({ term: z.string() }),
          execute: async ({ term }) => ({ answer: `${term} is a test` }),
        }),
        shout: createTool({
          id: 'shout',
          description: 'Uppercases text',
          inputSchema: z.object({ text: z.string() }),
          execute: async ({ text }) => ({ text: text.toUpperCase() }),
        }),
      },
    });
    this.http = createServer((req, res) => {
      this.requests.push(req.headers);
      if (this.refuse) {
        res.writeHead(401).end();
        return;
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      void this.mcp!.startHTTP({ url, httpPath: '/mcp', req, res });
    });
    await new Promise<void>((resolve) =>
      this.http!.listen(0, '127.0.0.1', resolve),
    );
    return this;
  }

  async stop(): Promise<void> {
    await this.mcp?.close();
    await new Promise<void>((resolve) => this.http?.close(() => resolve()));
  }
}
