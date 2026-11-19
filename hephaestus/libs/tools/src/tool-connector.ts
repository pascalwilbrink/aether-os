import type { ToolAction } from '@mastra/core/tools';

/** One tool server, ready to connect to: where, and what to send. */
export interface ToolServerConnection {
  /** The tool server's name: the agent gets its tools as `<name>_<tool>`. */
  name: string;
  url: string;
  /** Authentication: a credential, or a task's token. Never logged. */
  headers: Record<string, string>;
  /** Only these of its tools; all of them when undefined. */
  tools?: readonly string[];
}

/** A tool as people see it, to choose from. */
export interface ToolSummary {
  name: string;
  description: string;
}

/** Tools for one run, open until `close`. */
export interface ConnectedTools {
  /** By the name the agent sees. */
  tools: Record<string, ToolAction<any, any, any>>;
  close(): Promise<void>;
}

/**
 * Connects to tool servers (MCP over Streamable HTTP; `McpToolConnector`).
 * Fails with `ToolServerUnavailableError` (retryable when the server
 * didn't answer, not when it lacks a tool asked for).
 */
export abstract class ToolConnector {
  abstract connect(servers: ToolServerConnection[]): Promise<ConnectedTools>;
  abstract describe(server: ToolServerConnection): Promise<ToolSummary[]>;
}
