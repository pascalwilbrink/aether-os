import type { OrganizationId } from '@hephaestus/core';

import { OrganizationAlreadySuspendedError } from './error/organization-already-suspended.error.js';
import { OrganizationSuspendedError } from './error/organization-suspended.error.js';

export type OrganizationStatus = 'active' | 'suspended';

export interface CreateOrganizationProps {
  id: OrganizationId;
  name: string;
  slug: string;
  createdBy: string;
}

export interface OrganizationProps extends CreateOrganizationProps {
  status: OrganizationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Organization {
  private constructor(
    private readonly props: OrganizationProps,
  ) {}

  static create(props: CreateOrganizationProps): Organization {
    const now = new Date();

    return new Organization({
      ...props,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: OrganizationProps): Organization {
    return new Organization({ ...props });
  }

  get id(): OrganizationId {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug;
  }

  get status(): OrganizationStatus {
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

  /** Guards changes to resources owned by this organization. */
  ensureActive(): void {
    if (this.props.status !== 'active') {
      throw new OrganizationSuspendedError(this.props.id);
    }
  }

  suspend(): void {
    if (this.props.status === 'suspended') {
      throw new OrganizationAlreadySuspendedError(this.props.id);
    }

    this.props.status = 'suspended';
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.status = 'active';
    this.props.updatedAt = new Date();
  }
}
