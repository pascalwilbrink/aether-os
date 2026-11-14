import { Injectable, NotFoundException } from '@nestjs/common';

import type { OrganizationId, Page, PageRequest } from '@polis/core';

import {
  Organization,
  type CreateOrganizationProps,
} from '../../domain/organization.js';
import { OrganizationRepository } from '../../domain/repository/organization.repository.js';

export type CreateOrganizationInput = CreateOrganizationProps;

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async create(input: CreateOrganizationInput): Promise<Organization> {
    const organization = Organization.create(input);

    await this.organizationRepository.save(organization);

    return organization;
  }

  async findById(id: OrganizationId): Promise<Organization> {
    const organization = await this.organizationRepository.findById(id);

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  /** Like findById, but throws OrganizationSuspendedError if suspended. */
  async findActiveById(id: OrganizationId): Promise<Organization> {
    const organization = await this.findById(id);

    organization.ensureActive();

    return organization;
  }

  async findBySlug(slug: string): Promise<Organization> {
    const organization = await this.organizationRepository.findBySlug(slug);

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async list(page: PageRequest): Promise<Page<Organization>> {
    return this.organizationRepository.findAll(page);
  }

  async suspend(id: OrganizationId): Promise<Organization> {
    const organization = await this.findById(id);

    organization.suspend();

    await this.organizationRepository.save(organization);

    return organization;
  }

  async activate(id: OrganizationId): Promise<Organization> {
    const organization = await this.findById(id);

    organization.activate();

    await this.organizationRepository.save(organization);

    return organization;
  }
}
