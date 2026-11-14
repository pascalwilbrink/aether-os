import type {
    AgentId,
    AgentVersionId,
    OrganizationId,
  } from '@hephaestus/core';

  import { AgentArchivedError } from './error/agent-archived.error.js';
  
  export type AgentStatus = 'active' | 'archived';
  
  export interface CreateAgentProps {
    id: AgentId;
    organizationId: OrganizationId;
    name: string;
    description: string;
    createdBy: string;
  }
  
  export interface AgentProps {
    id: AgentId;
    organizationId: OrganizationId;
    name: string;
    description: string;
    status: AgentStatus;
    latestVersionId: AgentVersionId | null;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }
  
  export class Agent {
    private constructor(
      private readonly props: AgentProps,
    ) {}
  
    static create(props: CreateAgentProps): Agent {
      const now = new Date();
  
      return new Agent({
        ...props,
        status: 'active',
        latestVersionId: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  
    static reconstitute(props: AgentProps): Agent {
      return new Agent({ ...props });
    }
  
    get id(): AgentId {
      return this.props.id;
    }
  
    get organizationId(): OrganizationId {
      return this.props.organizationId;
    }
  
    get name(): string {
      return this.props.name;
    }
  
    get description(): string {
      return this.props.description;
    }
  
    get status(): AgentStatus {
      return this.props.status;
    }
  
    get latestVersionId(): AgentVersionId | null {
      return this.props.latestVersionId;
    }
  
    get createdBy(): string {
      return this.props.createdBy;
    }

    get createdAt(): Date {
      return this.props.createdAt;
    }
  
    get updatedAt(): Date {
      return this.props.updatedAt;
    }
  
    archive(): void {
      this.ensureActive();
  
      this.props.status = 'archived';
      this.props.updatedAt = new Date();
    }
  
    publishVersion(versionId: AgentVersionId): void {
      this.ensureActive();
  
      this.props.latestVersionId = versionId;
      this.props.updatedAt = new Date();
    }
  
    private ensureActive(): void {
      if (this.props.status !== 'active') {
        throw new AgentArchivedError(this.props.id);
      }
    }
}