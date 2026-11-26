import type { ErgonApi } from '@kairos/core';

/** A work item, as Ergon's API returns it. */
export type WorkItem = NonNullable<
  Awaited<ReturnType<typeof ErgonApi.getWorkItem>>['data']
>;

/**
 * Ergon, as Kairos needs it: one work item, read with Kairos's own token,
 * or null if Ergon doesn't have it. Throws `ErgonUnavailableError` when
 * Ergon can't be reached (the event is then retried). An interface, so
 * tests use a fake.
 */
export abstract class ErgonClient {
  abstract getWorkItem(
    organizationId: string,
    workItemId: string,
  ): Promise<WorkItem | null>;
}
