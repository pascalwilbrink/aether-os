import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { Principal } from '@pylon/core';
import type { CallContext } from '@pylon/usage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PURPOSE = /^[a-z][a-z0-9-]{0,31}$/;

type Headers = Record<string, string | string[] | undefined>;

const header = (headers: Headers, name: string): string | undefined => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/** `X-Aether-Purpose`, or the default; 400 for one that isn't a label. */
export function purposeOf(headers: Headers, fallback: string): string {
  const purpose = header(headers, 'x-aether-purpose');
  if (purpose === undefined) {
    return fallback;
  }
  if (!PURPOSE.test(purpose)) {
    throw new BadRequestException(
      'X-Aether-Purpose must be a lowercase label (e.g. agent, judge).',
    );
  }
  return purpose;
}

/** `X-Aether-Execution-Id`, if sent; 400 for one that isn't a UUID. */
function executionOf(headers: Headers): string | null {
  const id = header(headers, 'x-aether-execution-id');
  if (id === undefined) {
    return null;
  }
  if (!UUID.test(id)) {
    throw new BadRequestException('X-Aether-Execution-Id must be a UUID.');
  }
  return id;
}

/**
 * A pass-through call's context: only a task token, or a session token
 * (Hephaestus's sessions for a person, docs/interaction.md), may call
 * (docs/pylon.md, Identity); everything that decides keys and budgets comes
 * from it. A session's calls count against its organization's, project's
 * and agent's budgets (a session has no task tree).
 */
export function modelCallContext(
  principal: Principal,
  headers: Headers,
): CallContext {
  const task =
    principal.subType === 'service_account' && Boolean(principal.taskId);
  const session = principal.subType === 'user' && Boolean(principal.sessionId);
  if (!principal.organizationId || !principal.projectId || !(task || session)) {
    throw new ForbiddenException(
      'Model calls need a task token or a session token.',
    );
  }
  return {
    organizationId: principal.organizationId,
    projectId: principal.projectId,
    taskId: task ? principal.taskId : null,
    taskTreeId: task ? principal.taskTreeId : null,
    agentId: principal.agentId,
    agentVersionId: principal.agentVersionId,
    sessionId: session ? principal.sessionId : null,
    executionId: executionOf(headers),
    caller: principal.sub,
    purpose: purposeOf(headers, 'agent'),
  };
}

/**
 * An embeddings call's context: a task token or a service account's token
 * in the project, or a platform service's own (Seshat) charging the
 * project in the path. People's tokens don't embed.
 */
export function projectCallContext(
  principal: Principal,
  organizationId: string,
  projectId: string,
  headers: Headers,
): CallContext {
  if (principal.subType === 'user') {
    throw new ForbiddenException(
      "People don't call models directly: an agent or a service does.",
    );
  }
  return {
    organizationId,
    projectId,
    taskId: principal.taskId,
    taskTreeId: principal.taskTreeId,
    agentId: principal.agentId,
    agentVersionId: principal.agentVersionId,
    sessionId: principal.sessionId,
    executionId: executionOf(headers),
    caller: principal.sub,
    purpose: purposeOf(headers, 'knowledge'),
  };
}
