import { MCPClient } from '@mastra/mcp';
import type { ToolAction } from '@mastra/core/tools';
import { v7 as uuidv7 } from 'uuid';

import { guardedFetch } from '@hephaestus/core';
import {
  ToolConnector,
  type ConnectedTools,
  type ToolServerConnection,
  type ToolSummary,
} from './tool-connector.js';
import { ToolServerUnavailableError } from './tool-server.errors.js';

export interface McpToolConnectorOptions {
  allowPrivate: boolean;
  /** For connecting and for each call. */
  timeoutMs: number;
}

/**
 * Tool servers through Mastra's MCP client, from Hephaestus (never from a
 * sandbox). Every request goes through `guardedFetch` and only to the
 * server's own host; nothing is kept between runs.
 */
export class McpToolConnector extends ToolConnector {
  constructor(private readonly options: McpToolConnectorOptions) {
    super();
  }

  async connect(servers: ToolServerConnection[]): Promise<ConnectedTools> {
    if (servers.length === 0) {
      return { tools: {}, close: async () => undefined };
    }
    const client = this.client(servers);
    try {
      const { toolsets, errors } = await client.listToolsetsWithErrors();
      const tools: ConnectedTools['tools'] = {};
      for (const server of servers) {
        const offered = toolsets[server.name];
        if (!offered) {
          throw new ToolServerUnavailableError(
            `Tool server ${server.name} didn't answer: ${errors[server.name] ?? 'no tools'}`,
            true,
          );
        }
        const wanted = server.tools ?? Object.keys(offered);
        const missing = wanted.filter((name) => !offered[name]);
        if (missing.length > 0) {
          throw new ToolServerUnavailableError(
            `Tool server ${server.name} doesn't offer ${missing.join(', ')}`,
            false,
          );
        }
        for (const name of wanted) {
          const key = toolKey(server.name, name);
          if (tools[key]) {
            throw new ToolServerUnavailableError(
              `Two tools are both called ${key} for the agent: choose the tools of ${server.name}`,
              false,
            );
          }
          tools[key] = offered[name] as ToolAction<any, any, any>;
        }
      }
      return { tools, close: () => disconnect(client) };
    } catch (error) {
      await disconnect(client);
      throw error;
    }
  }

  async describe(server: ToolServerConnection): Promise<ToolSummary[]> {
    const client = this.client([server]);
    try {
      const { toolsets, errors } = await client.listToolsetsWithErrors();
      const offered = toolsets[server.name];
      if (!offered) {
        throw new ToolServerUnavailableError(
          errors[server.name] ?? 'no tools',
          true,
        );
      }
      return Object.entries(offered)
        .map(([name, tool]) => ({
          name,
          description: (tool as { description?: string }).description ?? '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } finally {
      await disconnect(client);
    }
  }

  private client(servers: ToolServerConnection[]): MCPClient {
    const fetch = guardedFetch(this.options.allowPrivate);
    return new MCPClient({
      // Unique per run: Mastra caches clients with identical configurations.
      id: uuidv7(),
      registerProcessHooks: false,
      timeout: this.options.timeoutMs,
      clientInfo: { name: 'aether-os-hephaestus', version: '1.0.0' },
      servers: Object.fromEntries(
        servers.map((server) => {
          const url = new URL(server.url);
          return [
            server.name,
            {
              url,
              allowedHosts: [url.host],
              connectTimeout: Math.min(this.options.timeoutMs, 15_000),
              timeout: this.options.timeoutMs,
              enableServerLogs: false,
              fetch: (input: string | URL, init?: RequestInit) => {
                const headers = new Headers(init?.headers);
                for (const [name, value] of Object.entries(server.headers)) {
                  headers.set(name, value);
                }
                return fetch(input, { ...init, headers });
              },
            },
          ];
        }),
      ),
    });
  }
}

/**
 * The name the agent sees: `<server>_<tool>`, in what model providers
 * accept (letters, digits, `_` and `-`, at most 64).
 */
export function toolKey(server: string, tool: string): string {
  return `${server}_${tool}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
}

async function disconnect(client: MCPClient): Promise<void> {
  await client.disconnect().catch(() => undefined);
}
