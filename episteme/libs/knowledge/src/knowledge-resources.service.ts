import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import {
  EpistemeEvents,
  mapPage,
  redactText,
  Transactional,
  ValidationProblemException,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@episteme/core';
import { PersonDirectory } from '@episteme/persons';
import { TenancyService } from '@episteme/tenancy';

import {
  canonicalContent,
  checksumOf,
  hasOwner,
  nextResourceStatus,
  normalizeScopes,
  normalizeStewards,
  normalizeTags,
  type Scope,
  type Steward,
} from './domain/index.js';
import type {
  KnowledgeResourceEntity,
  KnowledgeVersionEntity,
} from './entities/index.js';
import { NOT_INDEXED } from './entities/index.js';
import { assertMatches, KnowledgeAccess } from './knowledge-access.service.js';
import { KnowledgeAudit } from './knowledge-audit.service.js';
import { resourceEvent } from './knowledge-events.js';
import {
  invalidTransition,
  ownerRequired,
  resourcePublished,
  unknownPersons,
} from './knowledge.errors.js';
import { KnowledgeMapper } from './knowledge.mapper.js';
import { KnowledgeStore, type ResourceFilters } from './knowledge.store.js';

type Response = ApiTypes.KnowledgeResourceResponse;

/** Content as stored: secrets redacted, canonical line endings. */
export function storedContent(content: string): string {
  return canonicalContent(redactText(content, { keepEmails: true }));
}

/**
 * Knowledge resources (episteme/CLAUDE.md, KnowledgeResource): creating
 * one with its first draft, their metadata, scopes and stewards, archiving
 * and deleting them, and their audit. Every change bumps the resource's
 * `version`, is audited and announced, in one transaction.
 */
@Injectable()
export class KnowledgeResourcesService {
  constructor(
    private readonly store: KnowledgeStore,
    private readonly audit: KnowledgeAudit,
    private readonly events: EpistemeEvents,
    private readonly access: KnowledgeAccess,
    private readonly tenancy: TenancyService,
    private readonly persons: PersonDirectory,
    private readonly mapper: KnowledgeMapper,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    request: ApiTypes.KnowledgeResourceCreateRequest,
  ): Promise<Response> {
    if (request.projectId && request.departmentId) {
      throw new ValidationProblemException([
        {
          pointer: '/departmentId',
          parameter: null,
          code: 'INVALID',
          detail: 'A resource is owned by a project or a department, not both.',
        },
      ]);
    }
    const owner = {
      projectId: request.projectId ?? null,
      departmentId: request.departmentId ?? null,
    };
    this.access.assertCan(owner, 'draft');
    await this.access.assertOwnerWritable(organizationId, owner);
    const scopes = await this.checkScopes(organizationId, request.scopes ?? []);
    const stewards = await this.checkStewards(organizationId, request.stewards);
    const actor = this.access.actor();
    const now = new Date();
    const content = storedContent(request.content);
    const resource: KnowledgeResourceEntity = {
      id: uuidv7(),
      organizationId,
      ...owner,
      knowledgeType: request.knowledgeType,
      title: request.title,
      description: request.description ?? null,
      tags: normalizeTags(request.tags ?? []),
      status: 'draft',
      scopes,
      stewards,
      publishedVersionId: null,
      openVersionId: null,
      latestVersionNumber: 1,
      publishedAt: null,
      archivedAt: null,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    const version: KnowledgeVersionEntity = {
      id: uuidv7(),
      organizationId,
      resourceId: resource.id,
      number: 1,
      state: 'draft',
      content,
      checksum: checksumOf(content),
      changeSummary: request.changeSummary ?? null,
      basedOnVersionId: null,
      authoredBy: actor,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
      approvedAt: null,
      publishedAt: null,
      ...NOT_INDEXED,
    };
    resource.openVersionId = version.id;
    await this.store.insertResource(resource);
    await this.store.insertVersion(version);
    await this.audit.record({
      organizationId,
      resourceId: resource.id,
      action: 'resource_created',
      actor,
      changes: { knowledgeType: { from: null, to: resource.knowledgeType } },
      at: now,
    });
    await this.audit.record({
      organizationId,
      resourceId: resource.id,
      versionId: version.id,
      action: 'version_created',
      actor,
      at: now,
    });
    await this.events.emit(
      resourceEvent(resource, 'knowledge-resource.created', {
        resource: this.mapper.toResourceSnapshot(resource),
      }),
    );
    await this.events.emit(
      resourceEvent(resource, 'knowledge-version.created', {
        resourceId: resource.id,
        version: this.mapper.toVersionSnapshot(version),
      }),
    );
    return this.presentOne(resource);
  }

  async list(
    organizationId: string,
    query: ApiTypes.ListKnowledgeResourcesData['query'],
  ): Promise<Page<Response>> {
    const { scopeType, scopeId, limit, cursor, ...rest } = query ?? {};
    if ((scopeType === undefined) !== (scopeId === undefined)) {
      throw new ValidationProblemException([
        {
          pointer: null,
          parameter: scopeType === undefined ? 'scopeType' : 'scopeId',
          code: 'INVALID',
          detail: 'scopeType and scopeId go together.',
        },
      ]);
    }
    const filters: ResourceFilters = {
      ...rest,
      readable: {
        projects: this.access.readableProjects(),
        organization: this.access.readsOrganization(),
      },
      ...(scopeType && scopeId
        ? { scope: { type: scopeType, id: scopeId } }
        : {}),
    };
    const page = await this.store.pageResources(organizationId, filters, {
      limit,
      cursor,
    });
    const items = await this.present(page.items);
    return { items, nextCursor: page.nextCursor };
  }

  async get(organizationId: string, resourceId: string): Promise<Response> {
    const resource = await this.store.resource(organizationId, resourceId);
    this.access.assertCan(resource, 'read');
    return this.presentOne(resource);
  }

  @Transactional()
  async update(
    organizationId: string,
    resourceId: string,
    request: ApiTypes.KnowledgeResourceUpdateRequest,
    ifMatch: string | undefined,
  ): Promise<Response> {
    const resource = await this.lockForGovern(
      organizationId,
      resourceId,
      ifMatch,
    );
    const next = {
      title: request.title,
      description: request.description ?? null,
      tags: normalizeTags(request.tags ?? []),
    };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of ['title', 'description', 'tags'] as const) {
      if (JSON.stringify(resource[field]) !== JSON.stringify(next[field])) {
        changes[field] = { from: resource[field], to: next[field] };
      }
    }
    if (Object.keys(changes).length === 0) {
      return this.presentOne(resource);
    }
    Object.assign(resource, next);
    const now = this.touch(resource);
    await this.store.saveResource(resource);
    await this.audit.record({
      organizationId,
      resourceId,
      action: 'resource_updated',
      actor: this.access.actor(),
      changes,
      at: now,
    });
    await this.events.emit(
      resourceEvent(resource, 'knowledge-resource.updated', {
        resource: this.mapper.toResourceSnapshot(resource),
        changedFields: Object.keys(changes) as (
          'title' | 'description' | 'tags'
        )[],
      }),
    );
    return this.presentOne(resource);
  }

  @Transactional()
  async setScopes(
    organizationId: string,
    resourceId: string,
    request: ApiTypes.KnowledgeScopesRequest,
    ifMatch: string | undefined,
  ): Promise<Response> {
    const resource = await this.lockForGovern(
      organizationId,
      resourceId,
      ifMatch,
    );
    const kept = new Set(resource.scopes.map((s) => `${s.type}:${s.id}`));
    // Only new ones are checked: one archived since may stay.
    const scopes = normalizeScopes(request.scopes);
    await this.checkScopes(
      organizationId,
      scopes,
      (scope) => !kept.has(`${scope.type}:${scope.id}`),
    );
    if (JSON.stringify(scopes) === JSON.stringify(resource.scopes)) {
      return this.presentOne(resource);
    }
    const from = resource.scopes;
    resource.scopes = scopes;
    const now = this.touch(resource);
    await this.store.saveResource(resource);
    await this.audit.record({
      organizationId,
      resourceId,
      action: 'scopes_changed',
      actor: this.access.actor(),
      changes: { scopes: { from, to: scopes } },
      at: now,
    });
    await this.events.emit(
      resourceEvent(resource, 'knowledge-resource.updated', {
        resource: this.mapper.toResourceSnapshot(resource),
        changedFields: ['scopes'],
      }),
    );
    return this.presentOne(resource);
  }

  @Transactional()
  async setStewards(
    organizationId: string,
    resourceId: string,
    request: ApiTypes.KnowledgeStewardsRequest,
    ifMatch: string | undefined,
  ): Promise<Response> {
    const resource = await this.lockForGovern(
      organizationId,
      resourceId,
      ifMatch,
    );
    const stewards = await this.checkStewards(organizationId, request.stewards);
    if (JSON.stringify(stewards) === JSON.stringify(resource.stewards)) {
      return this.presentOne(resource);
    }
    const from = resource.stewards;
    resource.stewards = stewards;
    const now = this.touch(resource);
    await this.store.saveResource(resource);
    await this.audit.record({
      organizationId,
      resourceId,
      action: 'stewards_changed',
      actor: this.access.actor(),
      changes: { stewards: { from, to: stewards } },
      at: now,
    });
    await this.events.emit(
      resourceEvent(resource, 'knowledge-resource.updated', {
        resource: this.mapper.toResourceSnapshot(resource),
        changedFields: ['stewards'],
      }),
    );
    return this.presentOne(resource);
  }

  /**
   * Withdraws it from use: its published version stops being current, and
   * a version in review goes back to draft (its review withdrawn). Archiving
   * an archived resource returns it unchanged.
   */
  @Transactional()
  async archive(
    organizationId: string,
    resourceId: string,
    request: ApiTypes.ReasonRequest | undefined,
    ifMatch: string | undefined,
  ): Promise<Response> {
    const resource = await this.store.resource(
      organizationId,
      resourceId,
      true,
    );
    await this.access.assertOwnerOr(resource, 'publish');
    if (resource.status === 'archived') {
      return this.presentOne(resource);
    }
    await this.access.assertWritable(resource, ifMatch);
    const status = nextResourceStatus(resource.status, 'archive');
    if (!status)
      throw invalidTransition('Archiving the resource', resource.status);
    const actor = this.access.actor();
    const now = this.touch(resource);
    const withdrawnVersionId = resource.publishedVersionId;
    if (resource.openVersionId) {
      const open = await this.store.version(
        organizationId,
        resourceId,
        resource.openVersionId,
      );
      const review = await this.store.openReview(open.id);
      if (review) {
        review.state = 'withdrawn';
        review.closedAt = now;
        await this.store.saveReview(review);
        open.state = 'draft';
        open.updatedAt = now;
        await this.store.saveVersion(open);
      }
    }
    resource.status = status;
    resource.archivedAt = now;
    resource.publishedVersionId = null;
    await this.store.saveResource(resource);
    await this.audit.record({
      organizationId,
      resourceId,
      action: 'resource_archived',
      actor,
      reason: request?.reason ?? null,
      at: now,
    });
    await this.events.emit(
      resourceEvent(resource, 'knowledge-resource.archived', {
        resource: this.mapper.toResourceSnapshot(resource),
        withdrawnVersionId,
      }),
    );
    if (withdrawnVersionId) {
      const withdrawn = await this.store.version(
        organizationId,
        resourceId,
        withdrawnVersionId,
      );
      await this.events.emit(
        resourceEvent(resource, 'knowledge-version.withdrawn', {
          resourceId,
          version: this.mapper.toVersionSnapshot(withdrawn),
          reason: 'resource_archived',
        }),
      );
    }
    return this.presentOne(resource);
  }

  /** Only a resource that was never published; the audit keeps its record. */
  @Transactional()
  async remove(
    organizationId: string,
    resourceId: string,
    ifMatch: string | undefined,
  ): Promise<void> {
    const resource = await this.store.resource(
      organizationId,
      resourceId,
      true,
    );
    await this.access.assertOwnerOr(resource, 'publish');
    if (await this.store.wasPublished(resourceId)) throw resourcePublished();
    if (ifMatch !== undefined) {
      assertMatches(ifMatch, resource.version, 'Resource');
    }
    await this.access.assertOwnerWritable(organizationId, resource);
    const now = new Date();
    resource.version += 1;
    await this.store.deleteResource(resourceId);
    await this.audit.record({
      organizationId,
      resourceId,
      action: 'resource_deleted',
      actor: this.access.actor(),
      changes: { title: { from: resource.title, to: null } },
      at: now,
    });
    await this.events.emit(
      resourceEvent(resource, 'knowledge-resource.deleted', { resourceId }),
    );
  }

  async auditPage(
    organizationId: string,
    resourceId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.KnowledgeAuditEntry>> {
    this.access.assertCan(
      await this.store.resource(organizationId, resourceId),
      'read',
    );
    const entries = await this.audit.page(organizationId, resourceId, page);
    return mapPage(entries, (entry) => this.mapper.toAuditEntry(entry));
  }

  /** The resource with its published and open versions, for responses. */
  async presentOne(resource: KnowledgeResourceEntity): Promise<Response> {
    const [response] = await this.present([resource]);
    return response;
  }

  private async present(
    resources: KnowledgeResourceEntity[],
  ): Promise<Response[]> {
    const ids = resources.flatMap((r) =>
      [r.publishedVersionId, r.openVersionId].filter(
        (id): id is string => id !== null,
      ),
    );
    const versions = new Map(
      (await this.store.versionsByIds(ids)).map((version) => [
        version.id,
        version,
      ]),
    );
    return resources.map((resource) =>
      this.mapper.toResourceResponse(resource, versions),
    );
  }

  private async lockForGovern(
    organizationId: string,
    resourceId: string,
    ifMatch: string | undefined,
  ): Promise<KnowledgeResourceEntity> {
    const resource = await this.store.resource(
      organizationId,
      resourceId,
      true,
    );
    await this.access.assertOwnerOr(resource, 'govern');
    await this.access.assertWritable(resource, ifMatch);
    return resource;
  }

  private touch(resource: KnowledgeResourceEntity): Date {
    const now = new Date();
    resource.version += 1;
    resource.updatedAt = now;
    return now;
  }

  /** Scopes normalized; the ones `check` selects must be active in Polis (400 naming them). */
  private async checkScopes(
    organizationId: string,
    scopes: readonly Scope[],
    check: (scope: Scope) => boolean = () => true,
  ): Promise<Scope[]> {
    const normalized = normalizeScopes(scopes);
    const toCheck = normalized.filter(check);
    const unknown = await this.tenancy.unknownScopes(organizationId, toCheck);
    if (unknown.length > 0) {
      throw new ValidationProblemException(
        unknown.map((index) => ({
          pointer: `/scopes/${normalized.indexOf(toCheck[index])}`,
          parameter: null,
          code: 'INVALID' as const,
          detail: `Not an active ${toCheck[index].type} of the organization.`,
        })),
      );
    }
    return normalized;
  }

  /** Stewards normalized, with an owner, all active persons of the organization. */
  private async checkStewards(
    organizationId: string,
    stewards: readonly Steward[],
  ): Promise<Steward[]> {
    const normalized = normalizeStewards(stewards);
    if (!hasOwner(normalized)) throw ownerRequired();
    const unknown = await this.persons.unknown(
      organizationId,
      normalized.map((steward) => steward.personId),
    );
    if (unknown.length > 0) throw unknownPersons(unknown);
    return normalized;
  }
}
