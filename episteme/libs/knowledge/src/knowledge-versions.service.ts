import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import {
  EpistemeEvents,
  mapPage,
  Transactional,
  ValidationProblemException,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@episteme/core';

import { checksumOf, unifiedDiff } from './domain/index.js';
import type { KnowledgeVersionEntity } from './entities/index.js';
import { NOT_INDEXED } from './entities/index.js';
import { assertMatches, KnowledgeAccess } from './knowledge-access.service.js';
import { KnowledgeAudit } from './knowledge-audit.service.js';
import { resourceEvent } from './knowledge-events.js';
import { storedContent } from './knowledge-resources.service.js';
import { draftExists, notADraft, unknownVersion } from './knowledge.errors.js';
import { KnowledgeMapper } from './knowledge.mapper.js';
import { KnowledgeStore } from './knowledge.store.js';

type Response = ApiTypes.KnowledgeVersionResponse;

/**
 * A resource's versions (episteme/CLAUDE.md, KnowledgeVersion): new drafts
 * (and restores), editing a draft in place, reading and comparing them.
 * Review and publication are `KnowledgeReviewsService`'s.
 */
@Injectable()
export class KnowledgeVersionsService {
  constructor(
    private readonly store: KnowledgeStore,
    private readonly audit: KnowledgeAudit,
    private readonly events: EpistemeEvents,
    private readonly access: KnowledgeAccess,
    private readonly mapper: KnowledgeMapper,
  ) {}

  async list(
    organizationId: string,
    resourceId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.KnowledgeVersionSummary>> {
    this.access.assertCan(
      await this.store.resource(organizationId, resourceId),
      'read',
    );
    const versions = await this.store.pageVersions(
      organizationId,
      resourceId,
      page,
    );
    return mapPage(versions, (version) =>
      this.mapper.toVersionSummary(version),
    );
  }

  async get(
    organizationId: string,
    resourceId: string,
    versionId: string,
  ): Promise<Response> {
    this.access.assertCan(
      await this.store.resource(organizationId, resourceId),
      'read',
    );
    return this.mapper.toVersionResponse(
      await this.store.version(organizationId, resourceId, versionId),
    );
  }

  /**
   * A new draft after the latest version. With `basedOnVersionId` and no
   * content it restores that version's content.
   */
  @Transactional()
  async create(
    organizationId: string,
    resourceId: string,
    request: ApiTypes.KnowledgeVersionCreateRequest,
  ): Promise<Response> {
    const resource = await this.store.resource(
      organizationId,
      resourceId,
      true,
    );
    this.access.assertCan(resource, 'draft');
    await this.access.assertWritable(resource);
    if (resource.openVersionId) throw draftExists();
    let content = request.content ?? null;
    const basedOnVersionId = request.basedOnVersionId ?? null;
    if (basedOnVersionId) {
      const basedOn = await this.store.findVersion(
        resourceId,
        basedOnVersionId,
      );
      if (!basedOn) throw unknownVersion(basedOnVersionId);
      content ??= basedOn.content;
    }
    if (content === null) {
      throw new ValidationProblemException([
        {
          pointer: '/content',
          parameter: null,
          code: 'REQUIRED',
          detail: 'Give the content, or the version to start from.',
        },
      ]);
    }
    const actor = this.access.actor();
    const now = new Date();
    const stored = storedContent(content);
    const version: KnowledgeVersionEntity = {
      id: uuidv7(),
      organizationId,
      resourceId,
      number: resource.latestVersionNumber + 1,
      state: 'draft',
      content: stored,
      checksum: checksumOf(stored),
      changeSummary: request.changeSummary ?? null,
      basedOnVersionId,
      authoredBy: actor,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
      approvedAt: null,
      publishedAt: null,
      ...NOT_INDEXED,
    };
    resource.latestVersionNumber = version.number;
    resource.openVersionId = version.id;
    resource.version += 1;
    resource.updatedAt = now;
    await this.store.insertVersion(version);
    await this.store.saveResource(resource);
    await this.audit.record({
      organizationId,
      resourceId,
      versionId: version.id,
      action: 'version_created',
      actor,
      changes: basedOnVersionId
        ? { basedOnVersionId: { from: null, to: basedOnVersionId } }
        : {},
      at: now,
    });
    await this.events.emit(
      resourceEvent(resource, 'knowledge-version.created', {
        resourceId,
        version: this.mapper.toVersionSnapshot(version),
      }),
    );
    return this.mapper.toVersionResponse(version);
  }

  /** A draft's content and change summary, by its author or the resource's owners and maintainers. */
  @Transactional()
  async update(
    organizationId: string,
    resourceId: string,
    versionId: string,
    request: ApiTypes.KnowledgeVersionUpdateRequest,
    ifMatch: string | undefined,
  ): Promise<Response> {
    const resource = await this.store.resource(
      organizationId,
      resourceId,
      true,
    );
    const version = await this.store.version(
      organizationId,
      resourceId,
      versionId,
    );
    await this.access.assertCanEdit(resource, version);
    if (ifMatch !== undefined)
      assertMatches(ifMatch, version.revision, 'Version');
    await this.access.assertWritable(resource);
    if (version.state !== 'draft') throw notADraft();
    const content = storedContent(request.content);
    const changeSummary = request.changeSummary ?? null;
    if (
      content === version.content &&
      changeSummary === version.changeSummary
    ) {
      return this.mapper.toVersionResponse(version);
    }
    const now = new Date();
    version.content = content;
    version.checksum = checksumOf(content);
    version.changeSummary = changeSummary;
    version.revision += 1;
    version.updatedAt = now;
    resource.version += 1;
    resource.updatedAt = now;
    await this.store.saveVersion(version);
    await this.store.saveResource(resource);
    await this.audit.record({
      organizationId,
      resourceId,
      versionId,
      action: 'version_edited',
      actor: this.access.actor(),
      changes: {
        revision: { from: version.revision - 1, to: version.revision },
      },
      at: now,
    });
    return this.mapper.toVersionResponse(version);
  }

  async diff(
    organizationId: string,
    resourceId: string,
    versionId: string,
    against: string,
  ): Promise<ApiTypes.KnowledgeVersionDiff> {
    this.access.assertCan(
      await this.store.resource(organizationId, resourceId),
      'read',
    );
    const to = await this.store.version(organizationId, resourceId, versionId);
    const from = await this.store.findVersion(resourceId, against);
    if (!from) throw unknownVersion(against);
    return {
      fromVersionId: from.id,
      toVersionId: to.id,
      fromNumber: from.number,
      toNumber: to.number,
      diff: unifiedDiff(from, to),
    };
  }
}
