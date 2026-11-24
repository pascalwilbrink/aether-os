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

/** A file of a skill's folder. */
export interface TestSkillFile {
  path: string;
  content: string;
}

/**
 * One of Agora's skills, as its events announce it: `skill.created` and
 * `skill-version.published` for the first version, then a
 * `skill-version.published` per version and `skill.archived`, each one
 * revision newer.
 */
export class PublishedSkill {
  private revision = 0;
  private versions = 0;

  private constructor(
    private readonly app: INestApplicationContext,
    readonly organizationId: string,
    readonly skillId: string,
    readonly name: string,
  ) {}

  /** A new skill with its first version (its name from `SKILL.md`'s front matter). */
  static async create(
    app: INestApplicationContext,
    organizationId: string,
    files: TestSkillFile[],
  ): Promise<PublishedSkill> {
    const name = frontMatter(files).name;
    const skill = new PublishedSkill(app, organizationId, uuidv7(), name);
    await skill.deliver('skill.created', {
      skillId: skill.skillId,
      name,
      createdBy: 'user-1',
      createdAt: new Date().toISOString(),
    });
    await skill.publish(files);
    return skill;
  }

  /** Its next version. */
  async publish(files: TestSkillFile[]): Promise<void> {
    this.versions += 1;
    const id = uuidv7();
    await this.deliver('skill-version.published', {
      skillId: this.skillId,
      skillVersionId: id,
      version: {
        id,
        skillId: this.skillId,
        organizationId: this.organizationId,
        name: this.name,
        version: this.versions,
        description: frontMatter(files).description,
        files,
        fileCount: files.length,
        sizeBytes: files.reduce((sum, file) => sum + file.content.length, 0),
        createdBy: 'user-1',
        createdAt: new Date().toISOString(),
      },
    });
  }

  archive(): Promise<boolean> {
    return this.deliver('skill.archived', { skillId: this.skillId });
  }

  private deliver(eventType: string, payload: object): Promise<boolean> {
    this.revision += 1;
    return deliverAgoraEvent(this.app, {
      eventType,
      aggregateId: this.skillId,
      aggregateVersion: this.revision,
      organizationId: this.organizationId,
      payload,
    });
  }
}

/** `name` and `description` from `SKILL.md`'s front matter. */
function frontMatter(files: TestSkillFile[]): {
  name: string;
  description: string;
} {
  const skillMd = files.find((file) => file.path === 'SKILL.md')?.content ?? '';
  const field = (key: string) =>
    new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(skillMd)?.[1].trim() ?? '';
  return { name: field('name'), description: field('description') };
}

/** A council member, as a council version lists them. */
export interface TestCouncilMember {
  agentId: string;
  participation: 'required' | 'conditional' | 'optional';
  role?: string;
  when?: string;
}

/**
 * A council with one published version, as Agora would have announced it
 * (`council.created`, `council-version.published`).
 */
export async function publishedCouncil(
  app: INestApplicationContext,
  organizationId: string,
  fields: {
    facilitatorId: string;
    members: TestCouncilMember[];
    allowDirectInteraction?: boolean;
  },
): Promise<{ councilId: string; versionId: string }> {
  const councilId = uuidv7();
  const versionId = uuidv7();
  await deliverAgoraEvent(app, {
    eventType: 'council.created',
    aggregateId: councilId,
    aggregateVersion: 1,
    organizationId,
    payload: {
      councilId,
      key: 'architecture',
      name: 'Architecture',
      description: '',
      createdBy: 'user-1',
      createdAt: new Date().toISOString(),
    },
  });
  await deliverAgoraEvent(app, {
    eventType: 'council-version.published',
    aggregateId: councilId,
    aggregateVersion: 2,
    organizationId,
    payload: {
      councilId,
      councilVersionId: versionId,
      previousVersionId: null,
      version: {
        id: versionId,
        councilId,
        organizationId,
        version: 1,
        status: 'published',
        facilitator: { agentId: fields.facilitatorId },
        members: fields.members,
        settings: {
          defaultMode: 'facilitated',
          allowDirectInteraction: fields.allowDirectInteraction ?? true,
          allowDiscussion: true,
          allowPlanning: true,
          allowDelegation: false,
          requireSynthesis: true,
        },
        discussion: {
          maxRounds: 3,
          allowAgentResponses: true,
          requireFacilitatorConclusion: true,
        },
        createdBy: 'user-1',
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      },
    },
  });
  return { councilId, versionId };
}
