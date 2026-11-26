import { ErgonClient, type WorkItem } from '@kairos/automations';

/** Ergon as Kairos sees it, set up by each test; `down` makes it unreachable. */
export class FakeErgon extends ErgonClient {
  readonly workItems = new Map<string, WorkItem>();
  readonly reads: string[] = [];
  down = false;

  getWorkItem(organizationId: string, workItemId: string) {
    this.reads.push(workItemId);
    if (this.down) {
      return Promise.reject(new Error('Ergon is down'));
    }
    const item = this.workItems.get(workItemId);
    return Promise.resolve(
      item?.organizationId === organizationId ? item : null,
    );
  }
}
