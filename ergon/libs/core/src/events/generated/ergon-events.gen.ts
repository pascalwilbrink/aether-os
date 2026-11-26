// This file is generated from ergon.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `work-assignment.changed`.
 */
export interface WorkAssignmentChanged {
  change: 'started' | 'ended';
  assignmentId: string;
  workItemId: string;
  workItemTitle: string;
  assignee: {
    kind: 'person' | 'agent';
    id: string;
    versionId: string | null;
  };
  role: 'responsible' | 'contributor' | 'reviewer' | 'observer';
  /**
   * Why it started, or why it ended (`Person deleted` and `Agent archived` when Ergon ended it, with a null actor).
   */
  reason: string | null;
}

/**
 * Payload of `work-dependency.created`.
 */
export interface WorkDependencyCreated {
  dependencyId: string;
  kind: 'blocks' | 'relates_to';
  fromWorkItemId: string;
  toWorkItemId: string;
}

/**
 * Payload of `work-dependency.removed`.
 */
export interface WorkDependencyRemoved {
  dependencyId: string;
  kind: 'blocks' | 'relates_to';
  fromWorkItemId: string;
  toWorkItemId: string;
}

/**
 * Payload of `work-item.created`.
 */
export interface WorkItemCreated {
  /**
   * The work item as it is after the change (its text fields left out).
   */
  workItem: {
    id: string;
    parentId: string | null;
    /**
     * The API's `WorkItemType`.
     */
    type: string;
    title: string;
    status:
      'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    needsReview: boolean;
    dueAt: string | null;
    source: {
      kind: 'person' | 'agent' | 'automation' | 'external';
      reference: string | null;
    };
  };
}

/**
 * Payload of `work-item.status-changed`.
 */
export interface WorkItemStatusChanged {
  /**
   * The work item as it is after the change (its text fields left out).
   */
  workItem: {
    id: string;
    parentId: string | null;
    /**
     * The API's `WorkItemType`.
     */
    type: string;
    title: string;
    status:
      'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    needsReview: boolean;
    dueAt: string | null;
    source: {
      kind: 'person' | 'agent' | 'automation' | 'external';
      reference: string | null;
    };
  };
  from: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
  to: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
  /**
   * The API's `WorkItemAction`.
   */
  action: string;
  reason: string | null;
}

/**
 * Payload of `work-item.updated`.
 */
export interface WorkItemUpdated {
  /**
   * The work item as it is after the change (its text fields left out).
   */
  workItem: {
    id: string;
    parentId: string | null;
    /**
     * The API's `WorkItemType`.
     */
    type: string;
    title: string;
    status:
      'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    needsReview: boolean;
    dueAt: string | null;
    source: {
      kind: 'person' | 'agent' | 'automation' | 'external';
      reference: string | null;
    };
  };
  changedFields: string[];
}

/** Every Ergon event type, mapped to its payload. */
export interface ErgonEventPayloads {
  'work-assignment.changed': WorkAssignmentChanged;
  'work-dependency.created': WorkDependencyCreated;
  'work-dependency.removed': WorkDependencyRemoved;
  'work-item.created': WorkItemCreated;
  'work-item.status-changed': WorkItemStatusChanged;
  'work-item.updated': WorkItemUpdated;
}

export type ErgonEventType = keyof ErgonEventPayloads;

/** Every Ergon event type in the spec. */
export const ERGON_EVENT_TYPES = [
  'work-assignment.changed',
  'work-dependency.created',
  'work-dependency.removed',
  'work-item.created',
  'work-item.status-changed',
  'work-item.updated',
] as const satisfies readonly ErgonEventType[];
