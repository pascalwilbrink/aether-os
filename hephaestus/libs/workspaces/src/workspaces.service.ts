import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  findPage,
  mapPage,
  Transactional,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@hephaestus/core';
import { OrganizationsService, ProjectsService } from '@hephaestus/tenancy';

import type { CreateWorkspaceRequest } from './dto/create-workspace.request.js';
import type { WorkspaceResponse } from './dto/workspace.response.js';
import {
  nextWorkspaceStatus,
  type WorkspaceAction,
} from './workspace-transitions.js';
import { WorkspaceEntity } from './workspace.entity.js';
import {
  InvalidWorkspaceExpiryError,
  InvalidWorkspaceTransitionError,
} from './workspace.errors.js';
import { WorkspaceMapper } from './workspace.mapper.js';

/** How an action checks the organization. */
type OrganizationCheck = 'active' | 'exists' | 'none';

/**
 * Sandboxed workspaces. Organization rules:
 * - reads and destroy require the organization to exist (destroy stays
 *   available so a suspended organization can still release resources);
 * - create requires an active organization and an active project in it;
 * - the user actions (acquire, release, suspend, resume) require an active
 *   organization;
 * - provisioner callbacks (startProvisioning, markReady, markDestroyed,
 *   markFailed, expire) are system-driven and skip the check.
 */
@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    private readonly mapper: WorkspaceMapper,
    private readonly organizations: OrganizationsService,
    private readonly projects: ProjectsService,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: CreateWorkspaceRequest,
  ): Promise<WorkspaceResponse> {
    await this.projects.assertAcceptsWrites(organizationId, dto.projectId);

    const now = new Date();
    if (new Date(dto.expiresAt) <= now) {
      throw new InvalidWorkspaceExpiryError(dto.expiresAt);
    }
    const entity = this.mapper.toEntity(dto, organizationId, now);
    // TypeORM's insert types don't take jsonb columns typed as interfaces.
    await this.workspaces.insert(
      entity as Parameters<Repository<WorkspaceEntity>['insert']>[0],
    );

    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    page: PageRequest,
  ): Promise<Page<WorkspaceResponse>> {
    await this.organizations.assertExists(organizationId);

    const entities = await findPage(
      this.workspaces,
      { where: { organizationId }, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    workspaceId: string,
  ): Promise<WorkspaceResponse> {
    await this.organizations.assertExists(organizationId);

    return this.mapper.toResponse(await this.load(organizationId, workspaceId));
  }

  // --- User actions ---

  acquire(organizationId: string, workspaceId: string) {
    return this.apply(
      organizationId,
      workspaceId,
      'acquire',
      'active',
      (w, now) => {
        w.startedAt = now;
      },
    );
  }

  release(organizationId: string, workspaceId: string) {
    return this.apply(organizationId, workspaceId, 'release', 'active');
  }

  suspend(organizationId: string, workspaceId: string) {
    return this.apply(organizationId, workspaceId, 'suspend', 'active');
  }

  resume(organizationId: string, workspaceId: string) {
    return this.apply(organizationId, workspaceId, 'resume', 'active');
  }

  /** Starts teardown; the provisioner completes it with `markDestroyed`. */
  destroy(organizationId: string, workspaceId: string) {
    return this.apply(organizationId, workspaceId, 'destroy', 'exists');
  }

  // --- Provisioner callbacks ---

  startProvisioning(organizationId: string, workspaceId: string) {
    return this.apply(organizationId, workspaceId, 'startProvisioning', 'none');
  }

  markReady(
    organizationId: string,
    workspaceId: string,
    reference: ApiTypes.SandboxReference,
  ) {
    return this.apply(organizationId, workspaceId, 'markReady', 'none', (w) => {
      w.sandboxReference = { ...reference };
    });
  }

  markDestroyed(organizationId: string, workspaceId: string) {
    return this.apply(
      organizationId,
      workspaceId,
      'markDestroyed',
      'none',
      (w, now) => {
        w.sandboxReference = null;
        w.destroyedAt = now;
      },
    );
  }

  markFailed(organizationId: string, workspaceId: string, reason: string) {
    return this.apply(
      organizationId,
      workspaceId,
      'markFailed',
      'none',
      (w) => {
        w.failureReason = reason;
      },
    );
  }

  expire(organizationId: string, workspaceId: string) {
    return this.apply(organizationId, workspaceId, 'expire', 'none');
  }

  @Transactional()
  private async apply(
    organizationId: string,
    workspaceId: string,
    action: WorkspaceAction,
    check: OrganizationCheck,
    effect?: (workspace: WorkspaceEntity, now: Date) => void,
  ): Promise<WorkspaceResponse> {
    if (check === 'active') {
      await this.organizations.assertAcceptsWrites(organizationId);
    } else if (check === 'exists') {
      await this.organizations.assertExists(organizationId);
    }

    const entity = await this.load(organizationId, workspaceId, true);
    const next = nextWorkspaceStatus(entity.status, action);
    if (!next) {
      throw new InvalidWorkspaceTransitionError(
        entity.id,
        entity.status,
        action,
      );
    }
    const now = new Date();
    effect?.(entity, now);
    entity.status = next;
    entity.updatedAt = now;
    await this.workspaces.save(entity);

    return this.mapper.toResponse(entity);
  }

  /** Scoped to the organization: another organization's workspace is a 404. */
  private async load(
    organizationId: string,
    workspaceId: string,
    forUpdate = false,
  ): Promise<WorkspaceEntity> {
    const entity = await this.workspaces.findOne({
      where: { id: workspaceId, organizationId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`);
    }

    return entity;
  }
}
