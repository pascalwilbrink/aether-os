import type { OrganizationId, ProjectId } from '@hephaestus/core';

import { ProjectArchivedError } from './error/project-archived.error.js';

export type ProjectStatus = 'active' | 'archived';

export interface CreateProjectProps {
  id: ProjectId;
  organizationId: OrganizationId;
  name: string;
  slug: string;
  description: string;
  createdBy: string;
}

export interface ProjectProps extends CreateProjectProps {
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Project {
  private constructor(
    private readonly props: ProjectProps,
  ) {}

  static create(props: CreateProjectProps): Project {
    const now = new Date();

    return new Project({
      ...props,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ProjectProps): Project {
    return new Project({ ...props });
  }

  get id(): ProjectId {
    return this.props.id;
  }

  get organizationId(): OrganizationId {
    return this.props.organizationId;
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug;
  }

  get description(): string {
    return this.props.description;
  }

  get status(): ProjectStatus {
    return this.props.status;
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

  /** Guards changes to resources that belong to this project. */
  ensureActive(): void {
    if (this.props.status !== 'active') {
      throw new ProjectArchivedError(this.props.id);
    }
  }

  archive(): void {
    this.ensureActive();

    this.props.status = 'archived';
    this.props.updatedAt = new Date();
  }
}
