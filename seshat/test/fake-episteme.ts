import { v7 as uuidv7 } from 'uuid';

import {
  EpistemeSource,
  EpistemeSourceError,
  type EpistemePublished,
  type EpistemeResourceState,
} from '@seshat/knowledge';

/**
 * Episteme's resources as Seshat reads them: `publish` sets a resource's
 * published version (a new version ID each time, its `resourceVersion`
 * one more), `archive` and `remove` take it away; `failure` makes every
 * read throw. Records each read.
 */
export class FakeEpisteme extends EpistemeSource {
  private readonly resources = new Map<string, EpistemeResourceState>();
  readonly reads: string[] = [];
  failure: EpistemeSourceError | null = null;

  get configured(): boolean {
    return true;
  }

  /** Publishes a (new) version of the resource; its state now. */
  publish(
    resource: Partial<EpistemePublished> &
      Pick<EpistemePublished, 'organizationId'>,
  ): EpistemePublished {
    const resourceId = resource.resourceId ?? uuidv7();
    const before = this.resources.get(resourceId);
    const previous = before?.kind === 'published' ? before.published : null;
    const published: EpistemePublished = {
      projectId: null,
      departmentId: null,
      knowledgeType: 'policy',
      title: 'Travel policy',
      tags: [],
      content: '# Travel\n\nBook trains for trips under five hours.',
      ...previous,
      ...resource,
      resourceId,
      resourceVersion: this.versionOf(before) + 1,
      versionId: resource.versionId ?? uuidv7(),
      versionNumber: (previous?.versionNumber ?? 0) + 1,
    };
    this.resources.set(resourceId, { kind: 'published', published });
    return published;
  }

  archive(resourceId: string): number {
    const resourceVersion = this.versionOf(this.resources.get(resourceId)) + 1;
    this.resources.set(resourceId, { kind: 'unpublished', resourceVersion });
    return resourceVersion;
  }

  remove(resourceId: string): void {
    this.resources.set(resourceId, { kind: 'gone' });
  }

  read(
    _organizationId: string,
    resourceId: string,
  ): Promise<EpistemeResourceState> {
    this.reads.push(resourceId);
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    return Promise.resolve(this.resources.get(resourceId) ?? { kind: 'gone' });
  }

  private versionOf(state: EpistemeResourceState | undefined): number {
    if (!state || state.kind === 'gone') return 0;
    return state.kind === 'published'
      ? state.published.resourceVersion
      : state.resourceVersion;
  }
}
