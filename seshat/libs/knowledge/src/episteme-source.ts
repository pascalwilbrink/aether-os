/**
 * What Seshat indexes of an Episteme resource: its owner, title, tags
 * and type, and its published version's content.
 */
export interface EpistemePublished {
  resourceId: string;
  organizationId: string;
  /** The owning project; null for the organization's or a department's. */
  projectId: string | null;
  /** The owning department; null for the organization's or a project's. */
  departmentId: string | null;
  knowledgeType: string;
  title: string;
  tags: string[];
  /** The resource's `version` as read: grows with every change there. */
  resourceVersion: number;
  versionId: string;
  versionNumber: number;
  /** Markdown. */
  content: string;
}

/**
 * A resource as Episteme has it now: published (indexed here), not
 * published (never, or archived: nothing indexed), or gone (deleted).
 */
export type EpistemeResourceState =
  | { kind: 'published'; published: EpistemePublished }
  | { kind: 'unpublished'; resourceVersion: number }
  | { kind: 'gone' };

/** Why a resource couldn't be read: retrying helps or it doesn't. */
export class EpistemeSourceError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Episteme's resources, read with Seshat's own token
 * (`HttpEpistemeSource`, `platform:read`); tests use a fake. Throws
 * `EpistemeSourceError`.
 */
export abstract class EpistemeSource {
  /** False without Episteme (`EPISTEME_URL`): its events are ignored. */
  abstract get configured(): boolean;

  abstract read(
    organizationId: string,
    resourceId: string,
  ): Promise<EpistemeResourceState>;
}

/** No Episteme configured: nothing of it is indexed. */
export class NoEpistemeSource extends EpistemeSource {
  get configured(): boolean {
    return false;
  }

  read(): Promise<EpistemeResourceState> {
    return Promise.reject(
      new EpistemeSourceError(
        "Episteme isn't configured (EPISTEME_URL)",
        false,
      ),
    );
  }
}
