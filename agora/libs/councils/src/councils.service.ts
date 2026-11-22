import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  AgoraEvents,
  type ApiTypes,
  findPage,
  isUniqueViolation,
  mapPage,
  type Page,
  type PageRequest,
  Transactional,
} from '@agora/core';
import { TenancyService } from '@agora/tenancy';

import { nextCouncilStatus } from './council-transitions.js';
import { CouncilEntity } from './council.entity.js';
import {
  CouncilAlreadyExistsError,
  CouncilArchivedError,
} from './council.errors.js';
import { CouncilMapper } from './council.mapper.js';

/**
 * Councils (../../../../docs/councils.md), like agents: writes need an
 * organization Polis says is active; every change bumps the council's
 * `version` and publishes an event in its transaction (`council.created`,
 * `council.archived`, and the version events through
 * `CouncilVersionsService`).
 */
@Injectable()
export class CouncilsService {
  constructor(
    @InjectRepository(CouncilEntity)
    private readonly councils: Repository<CouncilEntity>,
    private readonly mapper: CouncilMapper,
    private readonly tenancy: TenancyService,
    private readonly access: AccessControl,
    private readonly events: AgoraEvents,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: ApiTypes.CreateCouncilRequest,
  ): Promise<ApiTypes.CouncilResponse> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const entity = this.mapper.toEntity(
      dto,
      organizationId,
      this.access.principal().sub,
      new Date(),
    );
    try {
      await this.councils.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CouncilAlreadyExistsError(dto.key);
      }
      throw error;
    }
    await this.events.emit({
      eventType: 'council.created',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      payload: {
        councilId: entity.id,
        key: entity.key,
        name: entity.name,
        description: entity.description,
        createdBy: entity.createdBy,
        createdAt: entity.createdAt.toISOString(),
      },
    });
    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.CouncilResponse>> {
    const entities = await findPage(
      this.councils,
      { where: { organizationId }, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    councilId: string,
  ): Promise<ApiTypes.CouncilResponse> {
    return this.mapper.toResponse(await this.load(organizationId, councilId));
  }

  @Transactional()
  async archive(
    organizationId: string,
    councilId: string,
  ): Promise<ApiTypes.CouncilResponse> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, councilId, true);
    const next = nextCouncilStatus(entity.status, 'archive');
    if (next !== entity.status) {
      entity.status = next;
      entity.version += 1;
      entity.updatedAt = new Date();
      await this.councils.save(entity);
      await this.events.emit({
        eventType: 'council.archived',
        aggregateId: entity.id,
        aggregateVersion: entity.version,
        organizationId,
        payload: { councilId: entity.id },
      });
    }
    return this.mapper.toResponse(entity);
  }

  /** For reads of a council's versions: 404 unless the council exists. */
  async assertExists(organizationId: string, councilId: string): Promise<void> {
    if (!(await this.councils.existsBy({ id: councilId, organizationId }))) {
      throw this.notFound(councilId);
    }
  }

  /**
   * For changes to a council's versions: the organization must accept
   * writes and the council must be active (`COUNCIL_ARCHIVED`). Locks the
   * council row until the caller's transaction ends (numbering and
   * publishing take turns). Returns the published version.
   */
  @Transactional()
  async lockForVersionChange(
    organizationId: string,
    councilId: string,
  ): Promise<{ latestVersionId: string | null }> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, councilId, true);
    if (entity.status !== 'active') {
      throw new CouncilArchivedError(councilId);
    }
    return { latestVersionId: entity.latestVersionId };
  }

  /**
   * Bumps the council's version for one change to its versions, recording
   * the published one if given; the change's event's `aggregateVersion`.
   */
  @Transactional()
  async recordVersionChange(
    organizationId: string,
    councilId: string,
    latestVersionId?: string,
  ): Promise<number> {
    const entity = await this.load(organizationId, councilId, true);
    if (latestVersionId !== undefined) {
      entity.latestVersionId = latestVersionId;
    }
    entity.version += 1;
    entity.updatedAt = new Date();
    await this.councils.save(entity);
    return entity.version;
  }

  /** Scoped to the organization: another organization's council is a 404. */
  private async load(
    organizationId: string,
    councilId: string,
    forUpdate = false,
  ): Promise<CouncilEntity> {
    const entity = await this.councils.findOne({
      where: { id: councilId, organizationId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw this.notFound(councilId);
    }
    return entity;
  }

  private notFound(councilId: string): NotFoundException {
    return new NotFoundException(`Council ${councilId} not found`);
  }
}
