import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import {
  AccessControl,
  type ApiTypes,
  findPage,
  mapPage,
  type Page,
  type PageRequest,
  Transactional,
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
 *   markFailed, expire) are system-driven and skip the check, as do the
 *   runner's own workspaces for executions (`createForExecution`,
 *   `acquireForExecution`, `destroyForExecution`, `activeForExecution`).
 */
@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    private readonly mapper: WorkspaceMapper,
    private readonly organizations: OrganizationsService,
    private readonly projects: ProjectsService,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: CreateWorkspaceRequest,
  ): Promise<WorkspaceResponse> {
    this.access.assertProjectPermission(dto.projectId, 'workspace:manage');
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

  /**
   * A sandbox for a task's execution (the runner; no caller, so no
   * permission check, and none for the organization: the runner only starts
   * tasks in active organizations and projects).
   */
  @Transactional()
  async createForExecution(
    organizationId: string,
    request: Omit<CreateWorkspaceRequest, 'repository'>,
  ): Promise<WorkspaceResponse> {
    const entity = this.mapper.toEntity(
      { ...request, repository: null },
      organizationId,
      new Date(),
    );
    await this.workspaces.insert(
      entity as Parameters<Repository<WorkspaceEntity>['insert']>[0],
    );
    return this.mapper.toResponse(entity);
  }

  /** The runner takes its ready workspace into use. */
  acquireForExecution(organizationId: string, workspaceId: string) {
    return this.apply(
      organizationId,
      workspaceId,
      'acquire',
      'none',
      (w, now) => {
        w.startedAt = now;
      },
    );
  }

  /** The runner tears down its workspace (then `markDestroyed`). */
  destroyForExecution(organizationId: string, workspaceId: string) {
    return this.apply(organizationId, workspaceId, 'destroy', 'none');
  }

  /** What its sandbox's proxy refused (the provisioner, before teardown). */
  @Transactional()
  async recordBlockedHosts(
    organizationId: string,
    workspaceId: string,
    hosts: string[],
  ): Promise<void> {
    await this.workspaces.update(
      { id: workspaceId, organizationId },
      { blockedHosts: [...new Set(hosts)].sort(), updatedAt: new Date() },
    );
  }

  /**
   * The sandbox each of these executions ran in (its latest workspace),
   * with what it could reach and what was refused; executions without one
   * are left out.
   */
  async sandboxesOf(
    organizationId: string,
    executionIds: string[],
  ): Promise<Map<string, ApiTypes.ExecutionSandbox>> {
    const sandboxes = new Map<string, ApiTypes.ExecutionSandbox>();
    if (executionIds.length === 0) return sandboxes;
    const entities = await this.workspaces.find({
      where: { organizationId, executionId: In(executionIds) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    for (const entity of entities) {
      sandboxes.set(entity.executionId, {
        workspaceId: entity.id,
        networkAccess: entity.sandbox.networkAccess,
        allowedHosts: entity.sandbox.allowedHosts ?? [],
        blockedHosts: entity.blockedHosts,
      });
    }
    return sandboxes;
  }

  /** An execution's workspaces that aren't destroyed, failed or expired. */
  async activeForExecution(
    organizationId: string,
    executionId: string,
  ): Promise<WorkspaceResponse[]> {
    const entities = await this.workspaces.find({
      where: {
        organizationId,
        executionId,
        status: In([
          'requested',
          'provisioning',
          'ready',
          'in_use',
          'suspended',
          'stopping',
        ]),
      },
    });
    return entities.map((entity) => this.mapper.toResponse(entity));
  }

  async list(
    organizationId: string,
    page: PageRequest,
  ): Promise<Page<WorkspaceResponse>> {
    await this.organizations.assertExists(organizationId);

    // Only workspaces in projects the caller may read.
    const readable = this.access.readableProjects();
    if (readable !== 'all' && readable.length === 0) {
      return { items: [], nextCursor: null };
    }
    const entities = await findPage(
      this.workspaces,
      {
        where:
          readable === 'all'
            ? { organizationId }
            : { organizationId, projectId: readable },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    workspaceId: string,
  ): Promise<WorkspaceResponse> {
    await this.organizations.assertExists(organizationId);

    const entity = await this.load(organizationId, workspaceId);
    this.access.assertProjectPermission(entity.projectId, 'workspace:read');
    return this.mapper.toResponse(entity);
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
    // User actions need the permission; provisioner callbacks have no caller.
    if (check !== 'none') {
      this.access.assertProjectPermission(entity.projectId, 'workspace:manage');
    }
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
