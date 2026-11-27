import { ForbiddenException, Injectable } from '@nestjs/common';
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

import {
  nextResourceStatus,
  nextVersionState,
  personsIn,
  type VersionAction,
} from './domain/index.js';
import type {
  KnowledgeResourceEntity,
  KnowledgeReviewEntity,
  KnowledgeVersionEntity,
} from './entities/index.js';
import { assertMatches, KnowledgeAccess } from './knowledge-access.service.js';
import { KnowledgeAudit } from './knowledge-audit.service.js';
import { resourceEvent } from './knowledge-events.js';
import {
  invalidTransition,
  notApproved,
  notInReview,
  resourceArchived,
} from './knowledge.errors.js';
import { KnowledgeMapper } from './knowledge.mapper.js';
import { KnowledgeStore } from './knowledge.store.js';

type Response = ApiTypes.KnowledgeVersionResponse;

const DECISIONS: Record<
  ApiTypes.KnowledgeDecision,
  {
    action: VersionAction;
    review: ApiTypes.KnowledgeReviewState;
    audit: ApiTypes.KnowledgeAuditAction;
  }
> = {
  approve: { action: 'approve', review: 'approved', audit: 'version_approved' },
  reject: { action: 'reject', review: 'rejected', audit: 'version_rejected' },
  request_changes: {
    action: 'request_changes',
    review: 'changes_requested',
    audit: 'changes_requested',
  },
};

/**
 * Review and publication (episteme/CLAUDE.md, Review and approval):
 * submitting a draft, withdrawing it, deciding (one approval is enough),
 * and publishing an approved version as the resource's authoritative one.
 * People decide and publish (Krepis gives the permissions to people only).
 */
@Injectable()
export class KnowledgeReviewsService {
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
    versionId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.KnowledgeReviewResponse>> {
    this.access.assertCan(
      await this.store.resource(organizationId, resourceId),
      'read',
    );
    await this.store.version(organizationId, resourceId, versionId);
    const reviews = await this.store.pageReviews(
      organizationId,
      versionId,
      page,
    );
    return mapPage(reviews, (review) => this.mapper.toReviewResponse(review));
  }

  /** `draft` → `in_review`, opening a review for its checksum; repeating it returns it unchanged. */
  @Transactional()
  async submit(
    organizationId: string,
    resourceId: string,
    versionId: string,
    request: ApiTypes.CommentRequest | undefined,
    ifMatch: string | undefined,
  ): Promise<Response> {
    const { resource, version } = await this.load(
      organizationId,
      resourceId,
      versionId,
    );
    await this.access.assertCanEdit(resource, version);
    if (version.state === 'in_review')
      return this.mapper.toVersionResponse(version);
    if (ifMatch !== undefined)
      assertMatches(ifMatch, version.revision, 'Version');
    await this.access.assertWritable(resource);
    const now = this.transition(resource, version, 'submit');
    version.submittedAt = now;
    const review: KnowledgeReviewEntity = {
      id: uuidv7(),
      organizationId,
      resourceId,
      versionId,
      round: (await this.store.reviewCount(versionId)) + 1,
      state: 'open',
      checksum: version.checksum,
      comment: request?.comment ?? null,
      requestedBy: this.access.actor(),
      requestedAt: now,
      closedAt: null,
      decisions: [],
    };
    await this.store.insertReview(review);
    await this.save(resource, version);
    await this.audit.record({
      organizationId,
      resourceId,
      versionId,
      action: 'version_submitted',
      actor: review.requestedBy,
      reason: review.comment,
      at: now,
    });
    await this.events.emit(
      resourceEvent(resource, 'knowledge-version.submitted', {
        resourceId,
        version: this.mapper.toVersionSnapshot(version),
        reviewId: review.id,
      }),
    );
    return this.mapper.toVersionResponse(version);
  }

  /** `in_review` → `draft`, by whoever submitted it or the resource's owners and maintainers. */
  @Transactional()
  async withdraw(
    organizationId: string,
    resourceId: string,
    versionId: string,
    request: ApiTypes.CommentRequest | undefined,
  ): Promise<Response> {
    const { resource, version } = await this.load(
      organizationId,
      resourceId,
      versionId,
    );
    const review = await this.store.openReview(versionId);
    if (!review) throw notInReview();
    await this.access.assertCanEdit(resource, version, review.requestedBy);
    await this.access.assertWritable(resource);
    const now = this.transition(resource, version, 'withdraw');
    review.state = 'withdrawn';
    review.closedAt = now;
    await this.store.saveReview(review);
    await this.save(resource, version);
    await this.audit.record({
      organizationId,
      resourceId,
      versionId,
      action: 'version_withdrawn',
      actor: this.access.actor(),
      reason: request?.comment ?? null,
      at: now,
    });
    await this.events.emit(
      resourceEvent(resource, 'knowledge-version.returned', {
        resourceId,
        version: this.mapper.toVersionSnapshot(version),
        reviewId: review.id,
        reason: 'withdrawn',
      }),
    );
    return this.mapper.toVersionResponse(version);
  }

  /**
   * A decision on the version's open review, which closes it. Approving
   * takes one of the resource's approvers, or `org:knowledge:publish` when it
   * names none; rejecting and asking for changes need a comment.
   */
  @Transactional()
  async decide(
    organizationId: string,
    resourceId: string,
    versionId: string,
    request: ApiTypes.KnowledgeDecisionRequest,
  ): Promise<Response> {
    const comment = request.comment?.trim() || null;
    if (request.decision !== 'approve' && !comment) {
      throw new ValidationProblemException([
        {
          pointer: '/comment',
          parameter: null,
          code: 'REQUIRED',
          detail: 'Say why, to reject or to ask for changes.',
        },
      ]);
    }
    const { resource, version } = await this.load(
      organizationId,
      resourceId,
      versionId,
    );
    this.access.assertCan(resource, 'review');
    const review = await this.store.openReview(versionId);
    if (!review) throw notInReview();
    await this.access.assertWritable(resource);
    const persons = await this.access.callerPersons(organizationId);
    if (request.decision === 'approve') {
      const approvers = personsIn(resource.stewards, ['approver']);
      const allowed =
        approvers.size > 0
          ? [...persons].some((person) => approvers.has(person))
          : this.access.can(resource, 'publish');
      if (!allowed) {
        throw new ForbiddenException(
          approvers.size > 0
            ? "Only the resource's approvers may approve it"
            : 'Approving a resource without approvers needs the permission to publish it',
        );
      }
    }
    const rule = DECISIONS[request.decision];
    const actor = this.access.actor();
    const now = this.transition(resource, version, rule.action);
    if (request.decision === 'approve') version.approvedAt = now;
    review.state = rule.review;
    review.closedAt = now;
    review.decisions = [
      ...review.decisions,
      {
        id: uuidv7(),
        decision: request.decision,
        comment,
        personId: [...persons][0] ?? null,
        decidedBy: actor,
        decidedAt: now.toISOString(),
      },
    ];
    await this.store.saveReview(review);
    await this.save(resource, version);
    await this.audit.record({
      organizationId,
      resourceId,
      versionId,
      action: rule.audit,
      actor,
      reason: comment,
      at: now,
    });
    const reviewed = {
      resourceId,
      version: this.mapper.toVersionSnapshot(version),
      reviewId: review.id,
    };
    await this.events.emit(
      request.decision === 'approve'
        ? resourceEvent(resource, 'knowledge-version.approved', reviewed)
        : request.decision === 'reject'
          ? resourceEvent(resource, 'knowledge-version.rejected', reviewed)
          : resourceEvent(resource, 'knowledge-version.returned', {
              ...reviewed,
              reason: 'changes_requested',
            }),
    );
    return this.mapper.toVersionResponse(version);
  }

  /**
   * `approved` → `published`: the resource's authoritative version, the one
   * before it and any other approved one superseded. Publishing the
   * published version returns it unchanged.
   */
  @Transactional()
  async publish(
    organizationId: string,
    resourceId: string,
    versionId: string,
    request: ApiTypes.CommentRequest | undefined,
  ): Promise<Response> {
    const { resource, version } = await this.load(
      organizationId,
      resourceId,
      versionId,
    );
    this.access.assertCan(resource, 'publish');
    if (version.state === 'published')
      return this.mapper.toVersionResponse(version);
    if (resource.status === 'archived') throw resourceArchived();
    if (version.state !== 'approved') throw notApproved();
    await this.access.assertWritable(resource);
    const status = nextResourceStatus(resource.status, 'publish');
    if (!status) throw invalidTransition('Publishing', resource.status);
    const actor = this.access.actor();
    const now = this.transition(resource, version, 'publish');
    version.publishedAt = now;
    // Seshat indexes it and answers (KnowledgeIndexingListener).
    Object.assign(version, {
      indexingStatus: 'pending',
      indexingItemId: null,
      indexingChunkCount: null,
      indexingError: null,
      indexingRequestedAt: now,
      indexingUpdatedAt: now,
    } satisfies Partial<KnowledgeVersionEntity>);
    const previousId = resource.publishedVersionId;
    const superseded = (
      await this.store.versionsIn(resourceId, ['approved', 'published'])
    ).filter((other) => other.id !== version.id);
    for (const other of superseded) {
      other.state = nextVersionState(other.state, 'supersede') ?? other.state;
      other.updatedAt = now;
      await this.store.saveVersion(other);
      await this.audit.record({
        organizationId,
        resourceId,
        versionId: other.id,
        action: 'version_superseded',
        actor,
        changes: { supersededBy: { from: null, to: version.id } },
        at: now,
      });
    }
    resource.status = status;
    resource.publishedVersionId = version.id;
    resource.publishedAt = now;
    await this.save(resource, version);
    await this.audit.record({
      organizationId,
      resourceId,
      versionId,
      action: 'version_published',
      actor,
      reason: request?.comment ?? null,
      at: now,
    });
    await this.events.emit(
      resourceEvent(resource, 'knowledge-version.published', {
        resource: this.mapper.toResourceSnapshot(resource),
        version: this.mapper.toVersionSnapshot(version),
        previousVersionId: previousId,
      }),
    );
    const previous = superseded.find((other) => other.id === previousId);
    if (previous) {
      await this.events.emit(
        resourceEvent(resource, 'knowledge-version.withdrawn', {
          resourceId,
          version: this.mapper.toVersionSnapshot(previous),
          reason: 'superseded',
        }),
      );
    }
    return this.mapper.toVersionResponse(version);
  }

  private async load(
    organizationId: string,
    resourceId: string,
    versionId: string,
  ): Promise<{
    resource: KnowledgeResourceEntity;
    version: KnowledgeVersionEntity;
  }> {
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
    return { resource, version };
  }

  /** Applies the action to the version (`INVALID_TRANSITION` otherwise) and bumps the resource. */
  private transition(
    resource: KnowledgeResourceEntity,
    version: KnowledgeVersionEntity,
    action: VersionAction,
  ): Date {
    const state = nextVersionState(version.state, action);
    if (!state)
      throw invalidTransition(
        `To ${action.replace('_', ' ')} the version`,
        version.state,
      );
    const now = new Date();
    version.state = state;
    version.updatedAt = now;
    resource.openVersionId =
      state === 'draft' || state === 'in_review'
        ? version.id
        : resource.openVersionId === version.id
          ? null
          : resource.openVersionId;
    resource.version += 1;
    resource.updatedAt = now;
    return now;
  }

  private async save(
    resource: KnowledgeResourceEntity,
    version: KnowledgeVersionEntity,
  ): Promise<void> {
    await this.store.saveVersion(version);
    await this.store.saveResource(resource);
  }
}
