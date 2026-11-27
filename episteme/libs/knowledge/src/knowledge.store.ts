import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import {
  cursorBinding,
  decodeCursor,
  encodeCursor,
  findPage,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@episteme/core';

import {
  KnowledgeResourceEntity,
  KnowledgeReviewEntity,
  KnowledgeVersionEntity,
} from './entities/index.js';

export interface ResourceFilters {
  /** The projects whose resources the caller may read, and whether the organization's and departments'. */
  readable: { projects: 'all' | string[]; organization: boolean };
  owner?: 'organization' | 'project' | 'department';
  projectId?: string;
  departmentId?: string;
  knowledgeType?: ApiTypes.KnowledgeType;
  status?: ApiTypes.KnowledgeResourceStatus;
  scope?: { type: ApiTypes.KnowledgeScopeType; id: string };
  stewardPersonId?: string;
  tag?: string;
  q?: string;
}

/**
 * Resources, their versions and reviews in the database, for this module's
 * services: loading (and locking) them within an organization, saving,
 * paging. Permissions are the callers'.
 */
@Injectable()
export class KnowledgeStore {
  constructor(
    @InjectRepository(KnowledgeResourceEntity)
    private readonly resources: Repository<KnowledgeResourceEntity>,
    @InjectRepository(KnowledgeVersionEntity)
    private readonly versions: Repository<KnowledgeVersionEntity>,
    @InjectRepository(KnowledgeReviewEntity)
    private readonly reviews: Repository<KnowledgeReviewEntity>,
  ) {}

  /** 404 unless it's in the organization; `lock` takes it `FOR UPDATE`. */
  async resource(
    organizationId: string,
    resourceId: string,
    lock = false,
  ): Promise<KnowledgeResourceEntity> {
    const entity = await this.resources.findOne({
      where: { id: resourceId, organizationId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Resource ${resourceId} not found`);
    }
    return entity;
  }

  /** The version, locked, or null when it isn't one of the resource (in the organization). */
  async findVersionForUpdate(
    organizationId: string,
    resourceId: string,
    versionId: string,
  ): Promise<KnowledgeVersionEntity | null> {
    return this.versions.findOne({
      where: { id: versionId, resourceId, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /** 404 unless it's a version of the resource (in the organization). */
  async version(
    organizationId: string,
    resourceId: string,
    versionId: string,
  ): Promise<KnowledgeVersionEntity> {
    const entity = await this.versions.findOneBy({
      id: versionId,
      resourceId,
      organizationId,
    });
    if (!entity) {
      throw new NotFoundException(`Version ${versionId} not found`);
    }
    return entity;
  }

  /** A version of the resource, or null. */
  findVersion(
    resourceId: string,
    versionId: string,
  ): Promise<KnowledgeVersionEntity | null> {
    return this.versions.findOneBy({ id: versionId, resourceId });
  }

  versionsByIds(ids: readonly string[]): Promise<KnowledgeVersionEntity[]> {
    return ids.length === 0
      ? Promise.resolve([])
      : this.versions.findBy({ id: In([...ids]) });
  }

  /** The resource's versions in a state (e.g. its approved ones). */
  versionsIn(
    resourceId: string,
    states: KnowledgeVersionEntity['state'][],
  ): Promise<KnowledgeVersionEntity[]> {
    return this.versions.findBy({ resourceId, state: In(states) });
  }

  /** Whether any of the resource's versions was ever published. */
  wasPublished(resourceId: string): Promise<boolean> {
    return this.versions
      .createQueryBuilder('version')
      .where('version.resource_id = :resourceId', { resourceId })
      .andWhere('version.published_at IS NOT NULL')
      .getExists();
  }

  async insertResource(entity: KnowledgeResourceEntity): Promise<void> {
    await this.resources.insert(entity);
  }

  async saveResource(entity: KnowledgeResourceEntity): Promise<void> {
    await this.resources.save(entity);
  }

  async insertVersion(entity: KnowledgeVersionEntity): Promise<void> {
    await this.versions.insert(entity);
  }

  async saveVersion(entity: KnowledgeVersionEntity): Promise<void> {
    await this.versions.save(entity);
  }

  /** The resource with its versions and reviews (never-published resources only). */
  async deleteResource(resourceId: string): Promise<void> {
    await this.reviews.delete({ resourceId });
    await this.versions.delete({ resourceId });
    await this.resources.delete({ id: resourceId });
  }

  /** The version's open review, if any, locked. */
  openReview(versionId: string): Promise<KnowledgeReviewEntity | null> {
    return this.reviews.findOne({
      where: { versionId, state: 'open' },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /** How many times the version was submitted. */
  reviewCount(versionId: string): Promise<number> {
    return this.reviews.countBy({ versionId });
  }

  async insertReview(entity: KnowledgeReviewEntity): Promise<void> {
    await this.reviews.insert(entity);
  }

  async saveReview(entity: KnowledgeReviewEntity): Promise<void> {
    await this.reviews.save(entity);
  }

  pageVersions(
    organizationId: string,
    resourceId: string,
    page: PageRequest,
  ): Promise<Page<KnowledgeVersionEntity>> {
    return findPage(
      this.versions,
      {
        where: { organizationId, resourceId },
        sortBy: 'number',
        direction: 'DESC',
      },
      page,
    );
  }

  pageReviews(
    organizationId: string,
    versionId: string,
    page: PageRequest,
  ): Promise<Page<KnowledgeReviewEntity>> {
    return findPage(
      this.reviews,
      {
        where: { organizationId, versionId },
        sortBy: 'requestedAt',
        direction: 'DESC',
      },
      page,
    );
  }

  /**
   * The organization's resources, most recently updated first, filtered on
   * their metadata (scopes and stewards by `jsonb` containment).
   */
  async pageResources(
    organizationId: string,
    filters: ResourceFilters,
    page: { limit?: number; cursor?: string },
  ): Promise<Page<KnowledgeResourceEntity>> {
    const limit = page.limit ?? 50;
    const binding = cursorBinding({
      sort: 'updatedAt',
      direction: 'DESC',
      filters: { organizationId, ...filters },
    });
    const { readable, ...rest } = filters;
    const query = this.resources
      .createQueryBuilder('resource')
      .where('resource.organization_id = :organizationId', { organizationId });
    const projects = readable.projects;
    const projectClause =
      projects === 'all'
        ? 'resource.project_id IS NOT NULL'
        : projects.length > 0
          ? 'resource.project_id IN (:...readableProjects)'
          : 'FALSE';
    query.andWhere(
      `(${projectClause}${readable.organization ? ' OR resource.project_id IS NULL' : ''})`,
      projects === 'all' ? {} : { readableProjects: projects },
    );
    if (rest.owner === 'organization') {
      query.andWhere(
        'resource.project_id IS NULL AND resource.department_id IS NULL',
      );
    } else if (rest.owner === 'project') {
      query.andWhere('resource.project_id IS NOT NULL');
    } else if (rest.owner === 'department') {
      query.andWhere('resource.department_id IS NOT NULL');
    }
    if (rest.projectId) {
      query.andWhere('resource.project_id = :ownerProject', {
        ownerProject: rest.projectId,
      });
    }
    if (rest.departmentId) {
      query.andWhere('resource.department_id = :ownerDepartment', {
        ownerDepartment: rest.departmentId,
      });
    }
    if (filters.knowledgeType) {
      query.andWhere('resource.knowledge_type = :type', {
        type: filters.knowledgeType,
      });
    }
    if (filters.status) {
      query.andWhere('resource.status = :status', { status: filters.status });
    } else {
      query.andWhere(`resource.status <> 'archived'`);
    }
    if (filters.scope) {
      query.andWhere('resource.scopes @> :scope::jsonb', {
        scope: JSON.stringify([filters.scope]),
      });
    }
    if (filters.stewardPersonId) {
      query.andWhere('resource.stewards @> :steward::jsonb', {
        steward: JSON.stringify([{ personId: filters.stewardPersonId }]),
      });
    }
    if (filters.tag) {
      query.andWhere(':tag = ANY(resource.tags)', {
        tag: filters.tag.toLowerCase(),
      });
    }
    if (filters.q) {
      query.andWhere(`resource.title ILIKE :q ESCAPE '\\'`, {
        q: `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
      });
    }
    if (page.cursor) {
      const position = decodeCursor(page.cursor, binding);
      query.andWhere('(resource.updated_at, resource.id) < (:key, :id)', {
        key: new Date(position.key),
        id: position.id,
      });
    }
    const rows = await query
      .orderBy('resource.updated_at', 'DESC')
      .addOrderBy('resource.id', 'DESC')
      .limit(limit + 1)
      .getMany();
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ key: last.updatedAt, id: last.id }, binding)
          : null,
    };
  }
}
