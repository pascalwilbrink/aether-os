import { ServiceUnavailableException } from '@nestjs/common';

/** What Proxenos knows about a GitHub App installation. */
export interface GitHubInstallation {
  id: string;
  account: { login: string; type: 'Organization' | 'User' };
  repositorySelection: 'all' | 'selected';
  suspended: boolean;
}

/** A repository an installation covers. */
export interface GitHubRepository {
  id: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

/** GitHub's per-token permissions (docs/git.md: never `workflows`). */
export type GitHubPermissions = Partial<
  Record<
    'contents' | 'metadata' | 'pull_requests' | 'issues' | 'checks',
    'read' | 'write'
  >
>;

/**
 * The GitHub App, behind a port (docs/engineering.md: external systems
 * behind injected interfaces), so tests use a fake GitHub and other
 * providers can follow. Methods throw `GitHubUnavailableError` when GitHub
 * (or the app's secrets) can't be reached, and `GitHubNotConfiguredError`
 * when no app is configured.
 */
export abstract class GitHubApp {
  /** Whether an app is configured at all. */
  abstract get configured(): boolean;

  /** The app's installation page, which sends the person back with `state`. */
  abstract installUrl(state: string): string;

  /**
   * Whether the person who authorized `code` (GitHub's OAuth during
   * installation) can access the installation, i.e. installed or
   * administers it. False for an invalid or used code.
   */
  abstract userCanAccessInstallation(
    code: string,
    installationId: string,
  ): Promise<boolean>;

  /** The installation, or null if GitHub doesn't know it (uninstalled). */
  abstract installation(
    installationId: string,
  ): Promise<GitHubInstallation | null>;

  /** Every repository the installation covers. */
  abstract repositories(installationId: string): Promise<GitHubRepository[]>;

  /** An installation token for one repository with these permissions (at most an hour). */
  abstract createToken(
    installationId: string,
    repositoryId: string,
    permissions: GitHubPermissions,
  ): Promise<{ token: string; expiresAt: Date }>;

  /** Whether `signature` (`X-Hub-Signature-256`) is the app's for `body`. */
  abstract verifyWebhook(body: Buffer, signature: string): Promise<boolean>;
}

/** GitHub (or the app's secrets in OpenBao) can't be reached: 503. */
export class GitHubUnavailableError extends ServiceUnavailableException {
  constructor(reason: string) {
    super(`GitHub can't be reached right now (${reason}). Try again.`);
  }
}

/** No GitHub App configured for this Aether-os: 503. */
export class GitHubNotConfiguredError extends ServiceUnavailableException {
  constructor() {
    super('GitHub is not configured for this Aether-os (no GitHub App).');
  }
}
