// This file is generated from episteme.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `knowledge-resource.archived`.
 */
export interface KnowledgeResourceArchived {
  /**
   * The resource as it is after the change, without its title, description or content.
   */
  resource: {
    id: string;
    /**
     * The project that owns it; null for the organization's or a department's.
     */
    projectId: string | null;
    /**
     * The department that owns it; null for the organization's or a project's.
     */
    departmentId: string | null;
    /**
     * The API's `KnowledgeType`.
     */
    knowledgeType: string;
    status:
      | 'draft'
      | 'active'
      | 'under_review'
      | 'expired'
      | 'superseded'
      | 'archived';
    tags: string[];
    /**
     * Departments, teams and projects of Polis; empty for the whole organization.
     */
    scopes: {
      type: 'department' | 'team' | 'project';
      id: string;
    }[];
    /**
     * Persons of Polis, by ID.
     */
    stewards: {
      role: 'owner' | 'maintainer' | 'reviewer' | 'approver';
      personId: string;
    }[];
    publishedVersionId: string | null;
    latestVersionNumber: number;
  };
  /**
   * Its published version, which is no longer current; null when it had none.
   */
  withdrawnVersionId: string | null;
}

/**
 * Payload of `knowledge-resource.created`.
 */
export interface KnowledgeResourceCreated {
  /**
   * The resource as it is after the change, without its title, description or content.
   */
  resource: {
    id: string;
    /**
     * The project that owns it; null for the organization's or a department's.
     */
    projectId: string | null;
    /**
     * The department that owns it; null for the organization's or a project's.
     */
    departmentId: string | null;
    /**
     * The API's `KnowledgeType`.
     */
    knowledgeType: string;
    status:
      | 'draft'
      | 'active'
      | 'under_review'
      | 'expired'
      | 'superseded'
      | 'archived';
    tags: string[];
    /**
     * Departments, teams and projects of Polis; empty for the whole organization.
     */
    scopes: {
      type: 'department' | 'team' | 'project';
      id: string;
    }[];
    /**
     * Persons of Polis, by ID.
     */
    stewards: {
      role: 'owner' | 'maintainer' | 'reviewer' | 'approver';
      personId: string;
    }[];
    publishedVersionId: string | null;
    latestVersionNumber: number;
  };
}

/**
 * Payload of `knowledge-resource.deleted`.
 */
export interface KnowledgeResourceDeleted {
  resourceId: string;
}

/**
 * Payload of `knowledge-resource.updated`.
 */
export interface KnowledgeResourceUpdated {
  /**
   * The resource as it is after the change, without its title, description or content.
   */
  resource: {
    id: string;
    /**
     * The project that owns it; null for the organization's or a department's.
     */
    projectId: string | null;
    /**
     * The department that owns it; null for the organization's or a project's.
     */
    departmentId: string | null;
    /**
     * The API's `KnowledgeType`.
     */
    knowledgeType: string;
    status:
      | 'draft'
      | 'active'
      | 'under_review'
      | 'expired'
      | 'superseded'
      | 'archived';
    tags: string[];
    /**
     * Departments, teams and projects of Polis; empty for the whole organization.
     */
    scopes: {
      type: 'department' | 'team' | 'project';
      id: string;
    }[];
    /**
     * Persons of Polis, by ID.
     */
    stewards: {
      role: 'owner' | 'maintainer' | 'reviewer' | 'approver';
      personId: string;
    }[];
    publishedVersionId: string | null;
    latestVersionNumber: number;
  };
  changedFields: ('title' | 'description' | 'tags' | 'scopes' | 'stewards')[];
}

/**
 * Payload of `knowledge-version.approved`.
 */
export interface KnowledgeVersionApproved {
  resourceId: string;
  version: {
    id: string;
    number: number;
    state:
      | 'draft'
      | 'in_review'
      | 'approved'
      | 'rejected'
      | 'published'
      | 'superseded';
    /**
     * SHA-256 of the content (hex).
     */
    checksum: string;
    basedOnVersionId: string | null;
  };
  reviewId: string;
}

/**
 * Payload of `knowledge-version.created`.
 */
export interface KnowledgeVersionCreated {
  resourceId: string;
  version: {
    id: string;
    number: number;
    state:
      | 'draft'
      | 'in_review'
      | 'approved'
      | 'rejected'
      | 'published'
      | 'superseded';
    /**
     * SHA-256 of the content (hex).
     */
    checksum: string;
    basedOnVersionId: string | null;
  };
}

/**
 * Payload of `knowledge-version.published`.
 */
export interface KnowledgeVersionPublished {
  /**
   * The resource as it is after the change, without its title, description or content.
   */
  resource: {
    id: string;
    /**
     * The project that owns it; null for the organization's or a department's.
     */
    projectId: string | null;
    /**
     * The department that owns it; null for the organization's or a project's.
     */
    departmentId: string | null;
    /**
     * The API's `KnowledgeType`.
     */
    knowledgeType: string;
    status:
      | 'draft'
      | 'active'
      | 'under_review'
      | 'expired'
      | 'superseded'
      | 'archived';
    tags: string[];
    /**
     * Departments, teams and projects of Polis; empty for the whole organization.
     */
    scopes: {
      type: 'department' | 'team' | 'project';
      id: string;
    }[];
    /**
     * Persons of Polis, by ID.
     */
    stewards: {
      role: 'owner' | 'maintainer' | 'reviewer' | 'approver';
      personId: string;
    }[];
    publishedVersionId: string | null;
    latestVersionNumber: number;
  };
  version: {
    id: string;
    number: number;
    state:
      | 'draft'
      | 'in_review'
      | 'approved'
      | 'rejected'
      | 'published'
      | 'superseded';
    /**
     * SHA-256 of the content (hex).
     */
    checksum: string;
    basedOnVersionId: string | null;
  };
  /**
   * The version published before it, now superseded (`knowledge-version.withdrawn` for it too); null for the first.
   */
  previousVersionId: string | null;
}

/**
 * Payload of `knowledge-version.rejected`.
 */
export interface KnowledgeVersionRejected {
  resourceId: string;
  version: {
    id: string;
    number: number;
    state:
      | 'draft'
      | 'in_review'
      | 'approved'
      | 'rejected'
      | 'published'
      | 'superseded';
    /**
     * SHA-256 of the content (hex).
     */
    checksum: string;
    basedOnVersionId: string | null;
  };
  reviewId: string;
}

/**
 * Payload of `knowledge-version.returned`.
 */
export interface KnowledgeVersionReturned {
  resourceId: string;
  version: {
    id: string;
    number: number;
    state:
      | 'draft'
      | 'in_review'
      | 'approved'
      | 'rejected'
      | 'published'
      | 'superseded';
    /**
     * SHA-256 of the content (hex).
     */
    checksum: string;
    basedOnVersionId: string | null;
  };
  reviewId: string;
  reason: 'changes_requested' | 'withdrawn';
}

/**
 * Payload of `knowledge-version.submitted`.
 */
export interface KnowledgeVersionSubmitted {
  resourceId: string;
  version: {
    id: string;
    number: number;
    state:
      | 'draft'
      | 'in_review'
      | 'approved'
      | 'rejected'
      | 'published'
      | 'superseded';
    /**
     * SHA-256 of the content (hex).
     */
    checksum: string;
    basedOnVersionId: string | null;
  };
  reviewId: string;
}

/**
 * Payload of `knowledge-version.withdrawn`.
 */
export interface KnowledgeVersionWithdrawn {
  resourceId: string;
  version: {
    id: string;
    number: number;
    state:
      | 'draft'
      | 'in_review'
      | 'approved'
      | 'rejected'
      | 'published'
      | 'superseded';
    /**
     * SHA-256 of the content (hex).
     */
    checksum: string;
    basedOnVersionId: string | null;
  };
  reason: 'superseded' | 'resource_archived';
}

/** Every Episteme event type, mapped to its payload. */
export interface EpistemeEventPayloads {
  'knowledge-resource.archived': KnowledgeResourceArchived;
  'knowledge-resource.created': KnowledgeResourceCreated;
  'knowledge-resource.deleted': KnowledgeResourceDeleted;
  'knowledge-resource.updated': KnowledgeResourceUpdated;
  'knowledge-version.approved': KnowledgeVersionApproved;
  'knowledge-version.created': KnowledgeVersionCreated;
  'knowledge-version.published': KnowledgeVersionPublished;
  'knowledge-version.rejected': KnowledgeVersionRejected;
  'knowledge-version.returned': KnowledgeVersionReturned;
  'knowledge-version.submitted': KnowledgeVersionSubmitted;
  'knowledge-version.withdrawn': KnowledgeVersionWithdrawn;
}

export type EpistemeEventType = keyof EpistemeEventPayloads;

/** Every Episteme event type in the spec. */
export const EPISTEME_EVENT_TYPES = [
  'knowledge-resource.archived',
  'knowledge-resource.created',
  'knowledge-resource.deleted',
  'knowledge-resource.updated',
  'knowledge-version.approved',
  'knowledge-version.created',
  'knowledge-version.published',
  'knowledge-version.rejected',
  'knowledge-version.returned',
  'knowledge-version.submitted',
  'knowledge-version.withdrawn',
] as const satisfies readonly EpistemeEventType[];
