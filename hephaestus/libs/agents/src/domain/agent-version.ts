import type { AgentId, AgentVersionId, OrganizationId } from '@hephaestus/core';

import { InvalidAgentVersionTransitionError } from './error/invalid-agent-version-transition.error.js';

export type AgentVersionStatus = 'draft' | 'published' | 'deprecated';

export interface AgentModelConfiguration {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentToolConfiguration {
  name: string;
  enabled: boolean;
  configuration?: Record<string, unknown>;
}

export interface AgentSkillConfiguration {
  name: string;
  version: string;
  enabled: boolean;
}

export interface AgentRuntimeConfiguration {
  provider: string;
  executionMode: 'standard' | 'coding';
  sandboxRequired: boolean;
}

export interface CreateAgentVersionProps {
  id: AgentVersionId;
  agentId: AgentId;
  organizationId: OrganizationId;
  version: number;

  instructions: string;
  model: AgentModelConfiguration;

  capabilities: string[];
  tools: AgentToolConfiguration[];
  skills: AgentSkillConfiguration[];

  runtime: AgentRuntimeConfiguration;

  createdBy: string;
}

export interface AgentVersionProps extends CreateAgentVersionProps {
  status: AgentVersionStatus;
  createdAt: Date;
  publishedAt: Date | null;
}

export class AgentVersion {
  private constructor(private readonly props: AgentVersionProps) {}

  static create(props: CreateAgentVersionProps): AgentVersion {
    return new AgentVersion({
      ...props,
      capabilities: [...props.capabilities],
      tools: structuredClone(props.tools),
      skills: structuredClone(props.skills),
      model: structuredClone(props.model),
      runtime: structuredClone(props.runtime),
      status: 'draft',
      createdAt: new Date(),
      publishedAt: null,
    });
  }

  static reconstitute(props: AgentVersionProps): AgentVersion {
    return new AgentVersion({
      ...props,
      capabilities: [...props.capabilities],
      tools: structuredClone(props.tools),
      skills: structuredClone(props.skills),
      model: structuredClone(props.model),
      runtime: structuredClone(props.runtime),
    });
  }

  get id(): AgentVersionId {
    return this.props.id;
  }

  get agentId(): AgentId {
    return this.props.agentId;
  }

  get organizationId(): OrganizationId {
    return this.props.organizationId;
  }

  get version(): number {
    return this.props.version;
  }

  get instructions(): string {
    return this.props.instructions;
  }

  get model(): AgentModelConfiguration {
    return structuredClone(this.props.model);
  }

  get capabilities(): readonly string[] {
    return [...this.props.capabilities];
  }

  get tools(): readonly AgentToolConfiguration[] {
    return structuredClone(this.props.tools);
  }

  get skills(): readonly AgentSkillConfiguration[] {
    return structuredClone(this.props.skills);
  }

  get runtime(): AgentRuntimeConfiguration {
    return structuredClone(this.props.runtime);
  }

  get status(): AgentVersionStatus {
    return this.props.status;
  }

  get createdBy(): string {
    return this.props.createdBy;
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt);
  }

  get publishedAt(): Date | null {
    return this.props.publishedAt ? new Date(this.props.publishedAt) : null;
  }

  publish(): void {
    if (this.props.status !== 'draft') {
      throw new InvalidAgentVersionTransitionError(
        this.props.id,
        this.props.status,
        'published',
      );
    }

    this.props.status = 'published';
    this.props.publishedAt = new Date();
  }

  deprecate(): void {
    if (this.props.status !== 'published') {
      throw new InvalidAgentVersionTransitionError(
        this.props.id,
        this.props.status,
        'deprecated',
      );
    }

    this.props.status = 'deprecated';
  }
}
