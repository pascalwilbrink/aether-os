import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  mapPage,
  Transactional,
  ValidationProblemException,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@kairos/core';
import { TenancyService } from '@kairos/tenancy';

import { AutomationEntity } from './automation.entity.js';
import { AutomationArchivedError } from './automation.errors.js';
import { AutomationMapper } from './automation.mapper.js';
import { actionProblems, storedAction, storedTrigger } from './triggers.js';

type Response = ApiTypes.AutomationResponse;

/**
 * Automations (docs/automations.md): created, changed, paused, resumed and
 * archived by the project's admins (`automation:manage`, checked on the
 * route), in a project that accepts writes (Polis). What fires them is
 * `AutomationRunsService`.
 */
@Injectable()
export class AutomationsService {
  constructor(
    @InjectRepository(AutomationEntity)
    private readonly automations: Repository<AutomationEntity>,
    private readonly mapper: AutomationMapper,
    private readonly tenancy: TenancyService,
    private readonly access: AccessControl,
  ) {}

  async list(
    organizationId: string,
    projectId: string,
    query: PageRequest & { status?: ApiTypes.AutomationStatus },
  ): Promise<Page<Response>> {
    const { status, ...page } = query;
    const entities = await findPage(
      this.automations,
      {
        where: { organizationId, projectId, ...(status ? { status } : {}) },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async get(
    organizationId: string,
    projectId: string,
    automationId: string,
  ): Promise<Response> {
    return this.mapper.toResponse(
      await this.load(organizationId, projectId, automationId),
    );
  }

  @Transactional()
  async create(
    organizationId: string,
    projectId: string,
    request: ApiTypes.AutomationRequest,
  ): Promise<Response> {
    assertValid(request);
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    const entity = this.mapper.toEntity(
      { organizationId, projectId },
      request,
      this.access.principal().sub,
      new Date(),
    );
    await this.automations.insert(entity);
    return this.mapper.toResponse(entity);
  }

  @Transactional()
  async update(
    organizationId: string,
    projectId: string,
    automationId: string,
    request: ApiTypes.AutomationRequest,
  ): Promise<Response> {
    assertValid(request);
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    return this.change(organizationId, projectId, automationId, (entity) => {
      if (entity.status === 'archived') {
        throw new AutomationArchivedError(entity.id);
      }
      entity.name = request.name;
      entity.description = request.description ?? '';
      entity.trigger = storedTrigger(request.trigger);
      entity.action = storedAction(request.action);
      return true;
    });
  }

  @Transactional()
  async pause(
    organizationId: string,
    projectId: string,
    automationId: string,
  ): Promise<Response> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    return this.setStatus(organizationId, projectId, automationId, 'paused');
  }

  @Transactional()
  async resume(
    organizationId: string,
    projectId: string,
    automationId: string,
  ): Promise<Response> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    return this.setStatus(organizationId, projectId, automationId, 'active');
  }

  /** For good; allowed in a suspended organization or archived project too. */
  @Transactional()
  async archive(
    organizationId: string,
    projectId: string,
    automationId: string,
  ): Promise<Response> {
    return this.change(organizationId, projectId, automationId, (entity) => {
      if (entity.status === 'archived') return false;
      entity.status = 'archived';
      return true;
    });
  }

  /** An organization's active automations for an event (`AutomationRunsService`). */
  activeFor(
    organizationId: string,
    event: ApiTypes.GitHubIssueEventType,
  ): Promise<AutomationEntity[]> {
    return this.automations
      .createQueryBuilder('automation')
      .where('automation.organizationId = :organizationId', { organizationId })
      .andWhere("automation.status = 'active'")
      .andWhere("automation.trigger ->> 'event' = :event", { event })
      .orderBy('automation.createdAt', 'ASC')
      .getMany();
  }

  /** 404 unless the automation is in that project (`AutomationRunsService`). */
  async assertExists(
    organizationId: string,
    projectId: string,
    automationId: string,
  ): Promise<void> {
    await this.load(organizationId, projectId, automationId);
  }

  private setStatus(
    organizationId: string,
    projectId: string,
    automationId: string,
    status: 'active' | 'paused',
  ): Promise<Response> {
    return this.change(organizationId, projectId, automationId, (entity) => {
      if (entity.status === 'archived') {
        throw new AutomationArchivedError(entity.id);
      }
      if (entity.status === status) return false;
      entity.status = status;
      return true;
    });
  }

  /** Locks the automation, applies `apply`, and saves it if it changed. */
  private async change(
    organizationId: string,
    projectId: string,
    automationId: string,
    apply: (entity: AutomationEntity) => boolean,
  ): Promise<Response> {
    const entity = await this.load(
      organizationId,
      projectId,
      automationId,
      true,
    );
    if (apply(entity)) {
      entity.version += 1;
      entity.updatedAt = new Date();
      await this.automations.save(entity);
    }
    return this.mapper.toResponse(entity);
  }

  private async load(
    organizationId: string,
    projectId: string,
    automationId: string,
    lock = false,
  ): Promise<AutomationEntity> {
    const entity = await this.automations.findOne({
      where: { id: automationId, organizationId, projectId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Automation ${automationId} not found`);
    }
    return entity;
  }
}

function assertValid(request: ApiTypes.AutomationRequest): void {
  const problems = actionProblems(request.action);
  if (problems.length > 0) {
    throw new ValidationProblemException(
      problems.map(({ pointer, detail }) => ({
        pointer,
        parameter: null,
        code: 'INVALID',
        detail,
      })),
    );
  }
}
