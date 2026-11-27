import type {
  EpistemeEvent,
  EpistemeEventPayloads,
  EpistemeEventType,
} from '@episteme/core';

import type { KnowledgeResourceEntity } from './entities/index.js';

/**
 * An event about a resource: the resource is the aggregate, its `version`
 * the `aggregateVersion` (the events of one change share it), and
 * `projectId` is null (resources belong to the organization).
 */
export function resourceEvent<T extends EpistemeEventType>(
  resource: KnowledgeResourceEntity,
  eventType: T,
  payload: EpistemeEventPayloads[T],
): EpistemeEvent<T> {
  return {
    eventType,
    aggregateId: resource.id,
    aggregateVersion: resource.version,
    organizationId: resource.organizationId,
    projectId: null,
    payload,
  };
}
