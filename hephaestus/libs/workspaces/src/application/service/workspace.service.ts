import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  OrganizationId,
  Page,
  PageRequest,
  WorkspaceId,
} from '@hephaestus/core';
import { OrganizationService } from '@hephaestus/organizations';
import { ProjectService } from '@hephaestus/projects';

import { WorkspaceRepository } from '../../domain/repository/workspace.repository.js';
import {
  Workspace,
  type CreateWorkspaceProps,
  type SandboxReference,
} from '../../domain/workspace.js';

export type CreateWorkspaceInput = CreateWorkspaceProps;

type OrganizationCheck = 'active' | 'exists' | 'none';

/**
 * Organization rules:
 * - reads and destroy require the organization to exist (destroy stays
 *   available so a suspended organization can still release resources);
 * - create also requires the project to exist and be active;
 * - create and the user actions (acquire, release, suspend, resume)
 *   require it to be active;
 * - provisioner callbacks (startProvisioning, markReady, markDestroyed,
 *   markFailed, expire) are system-driven and skip the check.
 */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly organizations: OrganizationService,
    private readonly projects: ProjectService,
  ) {}

  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    // Also checks that the organization is active.
    await this.projects.findActiveById(input.organizationId, input.projectId);

    const workspace = Workspace.create(input);

    await this.workspaceRepository.save(workspace);

    return workspace;
  }

  async findById(
    organizationId: OrganizationId,
    workspaceId: WorkspaceId,
  ): Promise<Workspace> {
    await this.organizations.findById(organizationId);

    return this.loadWorkspace(organizationId, workspaceId);
  }

  async list(
    organizationId: OrganizationId,
    page: PageRequest,
  ): Promise<Page<Workspace>> {
    await this.organizations.findById(organizationId);

    return this.workspaceRepository.findByOrganization(organizationId, page);
  }

  // --- User actions ---

  acquire(organizationId: OrganizationId, workspaceId: WorkspaceId) {
    return this.change(organizationId, workspaceId, 'active', (w) =>
      w.acquire(),
    );
  }

  release(organizationId: OrganizationId, workspaceId: WorkspaceId) {
    return this.change(organizationId, workspaceId, 'active', (w) =>
      w.release(),
    );
  }

  suspend(organizationId: OrganizationId, workspaceId: WorkspaceId) {
    return this.change(organizationId, workspaceId, 'active', (w) =>
      w.suspend(),
    );
  }

  resume(organizationId: OrganizationId, workspaceId: WorkspaceId) {
    return this.change(organizationId, workspaceId, 'active', (w) =>
      w.resume(),
    );
  }

  destroy(organizationId: OrganizationId, workspaceId: WorkspaceId) {
    return this.change(organizationId, workspaceId, 'exists', (w) =>
      w.startDestroying(),
    );
  }

  // --- Provisioner callbacks ---

  startProvisioning(organizationId: OrganizationId, workspaceId: WorkspaceId) {
    return this.change(organizationId, workspaceId, 'none', (w) =>
      w.startProvisioning(),
    );
  }

  markReady(
    organizationId: OrganizationId,
    workspaceId: WorkspaceId,
    reference: SandboxReference,
  ) {
    return this.change(organizationId, workspaceId, 'none', (w) =>
      w.markReady(reference),
    );
  }

  markDestroyed(organizationId: OrganizationId, workspaceId: WorkspaceId) {
    return this.change(organizationId, workspaceId, 'none', (w) =>
      w.markDestroyed(),
    );
  }

  markFailed(
    organizationId: OrganizationId,
    workspaceId: WorkspaceId,
    reason: string,
  ) {
    return this.change(organizationId, workspaceId, 'none', (w) =>
      w.markFailed(reason),
    );
  }

  expire(organizationId: OrganizationId, workspaceId: WorkspaceId) {
    return this.change(organizationId, workspaceId, 'none', (w) =>
      w.expire(),
    );
  }

  private async change(
    organizationId: OrganizationId,
    workspaceId: WorkspaceId,
    organizationCheck: OrganizationCheck,
    apply: (workspace: Workspace) => void,
  ): Promise<Workspace> {
    if (organizationCheck === 'active') {
      await this.organizations.findActiveById(organizationId);
    } else if (organizationCheck === 'exists') {
      await this.organizations.findById(organizationId);
    }

    const workspace = await this.loadWorkspace(organizationId, workspaceId);

    apply(workspace);

    await this.workspaceRepository.save(workspace);

    return workspace;
  }

  private async loadWorkspace(
    organizationId: OrganizationId,
    workspaceId: WorkspaceId,
  ): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findById(
      organizationId,
      workspaceId,
    );

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
  }
}
