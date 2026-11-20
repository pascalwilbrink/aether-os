import { endpointProblem } from '@hephaestus/core';

import type { ToolServerAuthType } from './tool-server.entity.js';

/** What the platform allows of tool servers (`TOOL_SERVER_*`). */
export interface ToolServerPolicy {
  /** Private, loopback and link-local addresses, and `http://` (local development). */
  allowPrivate: boolean;
  /** Origins that may be sent a task's own token. */
  trustedOrigins: readonly string[];
}

/**
 * Why Hephaestus won't use this URL and authentication, or null when it
 * will: an endpoint Hephaestus calls (`endpointProblem`), and a task's token
 * only for a trusted origin.
 */
export function toolServerProblem(
  url: string,
  authType: ToolServerAuthType,
  policy: ToolServerPolicy,
): string | null {
  const problem = endpointProblem(url, policy);
  if (problem) {
    return problem === 'It is reached over https.'
      ? 'A tool server is reached over https.'
      : problem === "The URL can't hold credentials."
        ? "A tool server's URL can't hold credentials: set a header credential instead."
        : problem;
  }
  const origin = new URL(url).origin.toLowerCase();
  if (authType === 'task-token' && !policy.trustedOrigins.includes(origin)) {
    return `Only Aether-os's own tool servers are sent a task's token, and ${new URL(url).origin} isn't one (TOOL_SERVER_TRUSTED_ORIGINS).`;
  }
  return null;
}
