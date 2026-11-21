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
 * Payload of `git.pull-request.updated`.
 */
export interface GitPullRequestUpdated {
  repositoryId: string;
  /**
   * `owner/name`.
   */
  repository: string;
  number: number;
  url: string;
  state: 'open' | 'closed' | 'merged';
  /**
   * The head branch (`aether/<top-level task ID>` for Aether-os's).
   */
  branch: string;
  baseBranch: string;
  headSha: string;
  mergedAt: string | null;
  /**
   * The app's own bot made the change.
   */
  fromAetherOs: boolean;
}

/**
 * Payload of `git.pushed`.
 */
export interface GitPushed {
  webhookDeliveryId: string;
  /**
   * GitHub's `X-GitHub-Delivery`.
   */
  deliveryId: string;
  repositoryId: string;
  /**
   * `owner/name`.
   */
  repository: string;
  /**
   * The projects the repository is linked to (none when it isn't linked).
   */
  projectIds: string[];
  /**
   * The same projects with their repository link.
   */
  links: {
    projectId: string;
    linkId: string;
  }[];
  /**
   * The default branch, without `refs/heads/`.
   */
  branch: string;
  /**
   * The commit the branch was at (all zeros for a new branch).
   */
  before: string;
  /**
   * The commit it is at now.
   */
  after: string;
  /**
   * The app's own bot pushed.
   */
  fromAetherOs: boolean;
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

/**
 * Payload of `github.issue-comment.created`.
 */
export interface GithubIssueCommentCreated {
  webhookDeliveryId: string;
  /**
   * GitHub's `X-GitHub-Delivery`.
   */
  deliveryId: string;
  repositoryId: string;
  /**
   * `owner/name`.
   */
  repository: string;
  /**
   * The projects the repository is linked to (none when it isn't linked yet).
   */
  projectIds: string[];
  /**
   * The same projects with their repository link, whose ID a task working in the repository names (Hephaestus's `repository.linkId`).
   */
  links: {
    projectId: string;
    linkId: string;
  }[];
  number: number;
  /**
   * The issue's title
   */
  title: string;
  url: string;
  /**
   * A pull request's conversation (GitHub sends its comments as issue comments).
   */
  isPullRequest: boolean;
  /**
   * The issue's labels after the event.
   */
  labels: string[];
  /**
   * The label added (`github.issue.labeled`).
   */
  label: string | null;
  /**
   * GitHub's comment ID (`github.issue-comment.created`).
   */
  commentId: string | null;
  /**
   * Who did it (opened, labeled or commented), GitHub's `sender`.
   */
  author: {
    login: string;
    /**
     * `User`, `Bot` or `Organization`.
     */
    type: string;
  };
  /**
   * Their permission on the repository; null when GitHub couldn't be asked (treat as untrusted).
   */
  authorPermission:
    ('admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none') | null;
  /**
   * The app's own bot did it: automations ignore it unless they opt in (no loops).
   */
  fromAetherOs: boolean;
}

/**
 * Payload of `github.issue.labeled`.
 */
export interface GithubIssueLabeled {
  webhookDeliveryId: string;
  /**
   * GitHub's `X-GitHub-Delivery`.
   */
  deliveryId: string;
  repositoryId: string;
  /**
   * `owner/name`.
   */
  repository: string;
  /**
   * The projects the repository is linked to (none when it isn't linked yet).
   */
  projectIds: string[];
  /**
   * The same projects with their repository link, whose ID a task working in the repository names (Hephaestus's `repository.linkId`).
   */
  links: {
    projectId: string;
    linkId: string;
  }[];
  number: number;
  /**
   * The issue's title
   */
  title: string;
  url: string;
  /**
   * A pull request's conversation (GitHub sends its comments as issue comments).
   */
  isPullRequest: boolean;
  /**
   * The issue's labels after the event.
   */
  labels: string[];
  /**
   * The label added (`github.issue.labeled`).
   */
  label: string | null;
  /**
   * GitHub's comment ID (`github.issue-comment.created`).
   */
  commentId: string | null;
  /**
   * Who did it (opened, labeled or commented), GitHub's `sender`.
   */
  author: {
    login: string;
    /**
     * `User`, `Bot` or `Organization`.
     */
    type: string;
  };
  /**
   * Their permission on the repository; null when GitHub couldn't be asked (treat as untrusted).
   */
  authorPermission:
    ('admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none') | null;
  /**
   * The app's own bot did it: automations ignore it unless they opt in (no loops).
   */
  fromAetherOs: boolean;
}

/**
 * Payload of `github.issue.opened`.
 */
export interface GithubIssueOpened {
  webhookDeliveryId: string;
  /**
   * GitHub's `X-GitHub-Delivery`.
   */
  deliveryId: string;
  repositoryId: string;
  /**
   * `owner/name`.
   */
  repository: string;
  /**
   * The projects the repository is linked to (none when it isn't linked yet).
   */
  projectIds: string[];
  /**
   * The same projects with their repository link, whose ID a task working in the repository names (Hephaestus's `repository.linkId`).
   */
  links: {
    projectId: string;
    linkId: string;
  }[];
  number: number;
  /**
   * The issue's title
   */
  title: string;
  url: string;
  /**
   * A pull request's conversation (GitHub sends its comments as issue comments).
   */
  isPullRequest: boolean;
  /**
   * The issue's labels after the event.
   */
  labels: string[];
  /**
   * The label added (`github.issue.labeled`).
   */
  label: string | null;
  /**
   * GitHub's comment ID (`github.issue-comment.created`).
   */
  commentId: string | null;
  /**
   * Who did it (opened, labeled or commented), GitHub's `sender`.
   */
  author: {
    login: string;
    /**
     * `User`, `Bot` or `Organization`.
     */
    type: string;
  };
  /**
   * Their permission on the repository; null when GitHub couldn't be asked (treat as untrusted).
   */
  authorPermission:
    ('admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none') | null;
  /**
   * The app's own bot did it: automations ignore it unless they opt in (no loops).
   */
  fromAetherOs: boolean;
}

/** Every Proxenos event type, mapped to its payload. */
export interface ProxenosEventPayloads {
  'git.installation-changed': GitInstallationChanged;
  'git.pull-request.updated': GitPullRequestUpdated;
  'git.pushed': GitPushed;
  'git.repository-linked': GitRepositoryLinked;
  'git.repository-unlinked': GitRepositoryUnlinked;
  'github.issue-comment.created': GithubIssueCommentCreated;
  'github.issue.labeled': GithubIssueLabeled;
  'github.issue.opened': GithubIssueOpened;
}

export type ProxenosEventType = keyof ProxenosEventPayloads;

/** Every Proxenos event type in the spec. */
export const PROXENOS_EVENT_TYPES = [
  'git.installation-changed',
  'git.pull-request.updated',
  'git.pushed',
  'git.repository-linked',
  'git.repository-unlinked',
  'github.issue-comment.created',
  'github.issue.labeled',
  'github.issue.opened',
] as const satisfies readonly ProxenosEventType[];
