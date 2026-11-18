// This file is generated from proxenos.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `git.installation-changed`.
 */
export interface GitInstallationChanged {
  installationId: string;
  provider: 'github';
  externalId: string;
  /**
   * The GitHub account's login.
   */
  account: string;
  status: 'active' | 'suspended' | 'deleted';
  repositoriesAdded: {
    repositoryId: string;
    fullName: string;
  }[];
  repositoriesRemoved: {
    repositoryId: string;
    fullName: string;
  }[];
}

/**
 * Payload of `git.repository-linked`.
 */
export interface GitRepositoryLinked {
  linkId: string;
  projectId: string;
  repositoryId: string;
  fullName: string;
}

/**
 * Payload of `git.repository-unlinked`.
 */
export interface GitRepositoryUnlinked {
  linkId: string;
  projectId: string;
  repositoryId: string;
  fullName: string;
  reason: 'unlinked' | 'repository-removed';
}

/** Every Proxenos event type, mapped to its payload. */
export interface ProxenosEventPayloads {
  'git.installation-changed': GitInstallationChanged;
  'git.repository-linked': GitRepositoryLinked;
  'git.repository-unlinked': GitRepositoryUnlinked;
}

export type ProxenosEventType = keyof ProxenosEventPayloads;

/** Every Proxenos event type in the spec. */
export const PROXENOS_EVENT_TYPES = [
  'git.installation-changed',
  'git.repository-linked',
  'git.repository-unlinked',
] as const satisfies readonly ProxenosEventType[];
