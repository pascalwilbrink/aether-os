import type {
  OrganizationId,
  Page,
  PageRequest,
  WorkspaceId,
} from '@hephaestus/core';

import type { Workspace } from '../workspace.js';

export abstract class WorkspaceRepository {
  abstract save(workspace: Workspace): Promise<void>;

  abstract findById(
    organizationId: OrganizationId,
    workspaceId: WorkspaceId,
  ): Promise<Workspace | null>;

  /** Newest first. */
  abstract findByOrganization(
    organizationId: OrganizationId,
    page: PageRequest,
  ): Promise<Page<Workspace>>;
}
