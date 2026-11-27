import {
  createZodDto,
  zCommentRequest,
  zDiffKnowledgeVersionsQuery,
  zGetKnowledgeResourcePath,
  zGetKnowledgeVersionPath,
  zKnowledgeAuditPage,
  zKnowledgeDecisionRequest,
  zKnowledgeResourceCreateRequest,
  zKnowledgeResourcePage,
  zKnowledgeResourceResponse,
  zKnowledgeResourceUpdateRequest,
  zKnowledgeReviewPage,
  zKnowledgeScopesRequest,
  zKnowledgeStewardsRequest,
  zKnowledgeVersionCreateRequest,
  zKnowledgeVersionDiff,
  zKnowledgeVersionPage,
  zKnowledgeVersionResponse,
  zKnowledgeVersionUpdateRequest,
  zListKnowledgeAuditQuery,
  zListKnowledgeResourcesPath,
  zListKnowledgeResourcesQuery,
  zReasonRequest,
} from '@episteme/core';

export class OrganizationParams extends createZodDto(
  zListKnowledgeResourcesPath,
) {}
export class ResourceParams extends createZodDto(zGetKnowledgeResourcePath) {}
export class VersionParams extends createZodDto(zGetKnowledgeVersionPath) {}
export class ListResourcesQuery extends createZodDto(
  zListKnowledgeResourcesQuery,
) {}
export class PageQuery extends createZodDto(zListKnowledgeAuditQuery) {}
export class DiffQuery extends createZodDto(zDiffKnowledgeVersionsQuery) {}

export class ResourceCreateRequest extends createZodDto(
  zKnowledgeResourceCreateRequest,
) {}
export class ResourceUpdateRequest extends createZodDto(
  zKnowledgeResourceUpdateRequest,
) {}
export class ScopesRequest extends createZodDto(zKnowledgeScopesRequest) {}
export class StewardsRequest extends createZodDto(zKnowledgeStewardsRequest) {}
export class ReasonRequest extends createZodDto(zReasonRequest) {}
export class CommentRequest extends createZodDto(zCommentRequest) {}
export class VersionCreateRequest extends createZodDto(
  zKnowledgeVersionCreateRequest,
) {}
export class VersionUpdateRequest extends createZodDto(
  zKnowledgeVersionUpdateRequest,
) {}
export class DecisionRequest extends createZodDto(zKnowledgeDecisionRequest) {}

export class ResourceResponse extends createZodDto(
  zKnowledgeResourceResponse,
) {}
export class ResourcePage extends createZodDto(zKnowledgeResourcePage) {}
export class VersionResponse extends createZodDto(zKnowledgeVersionResponse) {}
export class VersionPage extends createZodDto(zKnowledgeVersionPage) {}
export class VersionDiff extends createZodDto(zKnowledgeVersionDiff) {}
export class ReviewPage extends createZodDto(zKnowledgeReviewPage) {}
export class AuditPage extends createZodDto(zKnowledgeAuditPage) {}
