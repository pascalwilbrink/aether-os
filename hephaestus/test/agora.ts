import type { INestApplicationContext } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { EventInbox, type AgentVersion } from '@hephaestus/core';

/** What a test's agent version runs with, unless the test says otherwise. */
export type VersionFields = Partial<
  Pick<
    AgentVersion,
    'instructions' | 'model' | 'capabilities' | 'tools' | 'skills' | 'runtime'
  >
>;

const DEFAULT_VERSION: Required<VersionFields> = {
  instructions: 'Be helpful.',
  model: { provider: 'anthropic', model: 'claude' },
  capabilities: [],
  tools: [],
  skills: [],
  runtime: {
    provider: 'mastra',
    executionMode: 'standard',
    sandboxRequired: false,
  },
};

/** Delivers an Agora event the way the consumer does (inbox, then handlers). */
export function deliverAgoraEvent(
  app: INestApplicationContext,
  event: {
    eventType: string;
    aggregateId: string;
    aggregateVersion: number;
    organizationId: string;
    payload: object;
  },
): Promise<boolean> {
  return app.get(EventInbox).receive('agora', {
    eventId: uuidv7(),
    schemaVersion: 1,
    occurredAt: new Date(),
    projectId: null,
    actor: { sub: 'user-1', sub_type: 'user' },
    ...event,
    payload: event.payload as Record<string, unknown>,
  });
}

/** Agora created an agent (`agent.created`, its first event). */
export async function createAgent(
  app: INestApplicationContext,
  organizationId: string,
  options: { agentId?: string; name?: string } = {},
): Promise<string> {
  const agentId = options.agentId ?? uuidv7();
  await deliverAgoraEvent(app, {
    eventType: 'agent.created',
    aggregateId: agentId,
    aggregateVersion: 1,
    organizationId,
    payload: {
      agentId,
      name: options.name ?? 'Helper',
      description: '',
      createdBy: 'user-1',
      createdAt: new Date().toISOString(),
    },
  });
  return agentId;
}

/**
 * Agora published a version of the agent (`agent-version.published` with
 * the whole version, then `agent-version.deprecated` for the one it
 * replaced). `aggregateVersion` is the agent's version after it.
 */
export async function publishVersion(
  app: INestApplicationContext,
  organizationId: string,
  agentId: string,
  fields: VersionFields & {
    aggregateVersion: number;
    version?: number;
    previousVersionId?: string | null;
  },
): Promise<string> {
  const id = uuidv7();
  const { aggregateVersion, previousVersionId = null, ...rest } = fields;
  const version: AgentVersion = {
    ...DEFAULT_VERSION,
    ...rest,
    id,
    agentId,
    organizationId,
    version: fields.version ?? 1,
    status: 'published',
    createdBy: 'user-1',
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  };
  await deliverAgoraEvent(app, {
    eventType: 'agent-version.published',
    aggregateId: agentId,
    aggregateVersion,
    organizationId,
    payload: {
      agentId,
      agentVersionId: id,
      policySetVersionId: null,
      previousVersionId,
      version,
    },
  });
  if (previousVersionId) {
    await deliverAgoraEvent(app, {
      eventType: 'agent-version.deprecated',
      aggregateId: agentId,
      aggregateVersion: aggregateVersion + 1,
      organizationId,
      payload: { agentId, agentVersionId: previousVersionId },
    });
  }
  return id;
}

/** An agent with one published version, as Agora would have announced it. */
export async function publishedAgent(
  app: INestApplicationContext,
  organizationId: string,
  fields: VersionFields & { name?: string } = {},
): Promise<{ agentId: string; versionId: string }> {
  const { name, ...version } = fields;
  const agentId = await createAgent(app, organizationId, { name });
  const versionId = await publishVersion(app, organizationId, agentId, {
    ...version,
    aggregateVersion: 2,
  });
  return { agentId, versionId };
}

/** Agora archived the agent (`agent.archived`). */
export async function archiveAgent(
  app: INestApplicationContext,
  organizationId: string,
  agentId: string,
  aggregateVersion: number,
): Promise<void> {
  await deliverAgoraEvent(app, {
    eventType: 'agent.archived',
    aggregateId: agentId,
    aggregateVersion,
    organizationId,
    payload: { agentId },
  });
}
