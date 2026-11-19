import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ProxenosEvents,
  Transactional,
  type Env,
  type GithubIssueOpened,
} from '@proxenos/core';
import {
  GitHubApp,
  GitHubUnavailableError,
  type RepositoryPermission,
} from '@proxenos/github';
import {
  InstallationsService,
  RepositoriesService,
} from '@proxenos/installations';
import { RepositoryLinksService } from '@proxenos/repositories';

/** The part of GitHub's `issues` and `issue_comment` payloads Proxenos reads. */
export interface GitHubIssuePayload {
  action?: string;
  installation?: { id?: number };
  repository?: { id?: number; full_name?: string };
  sender?: { login?: string; type?: string };
  issue?: {
    number: number;
    title: string;
    html_url: string;
    labels?: { name: string }[];
    pull_request?: unknown;
  };
  label?: { name: string };
  comment?: { id: number };
}

/**
 * The events Kairos triggers on, by GitHub event and action. They share one
 * payload (`GitHubIssueEvent` in the spec), typed per event when generated.
 */
const EVENT_TYPES = {
  'issues.opened': 'github.issue.opened',
  'issues.labeled': 'github.issue.labeled',
  'issue_comment.created': 'github.issue-comment.created',
} as const;

type IssueEventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/**
 * Issues and their comments on connected repositories (docs/git.md,
 * Webhooks), normalized for Kairos's automations: who did it, their role on
 * the repository (asked of GitHub: automations fire for collaborators with
 * write access by default), whether the app's own bot did it (no loops),
 * and the projects the repository is linked to. Titles are in the event;
 * bodies and comments stay in the stored delivery (untrusted, and large).
 */
@Injectable()
export class IssueEventsService {
  private readonly logger = new Logger(IssueEventsService.name);

  constructor(
    private readonly installations: InstallationsService,
    private readonly repositories: RepositoriesService,
    private readonly links: RepositoryLinksService,
    private readonly github: GitHubApp,
    private readonly events: ProxenosEvents,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** The event a delivery becomes, or null for one Kairos doesn't trigger on. */
  eventTypeOf(event: string, action: string | null): IssueEventType | null {
    return (
      (EVENT_TYPES as Record<string, IssueEventType>)[`${event}.${action}`] ??
      null
    );
  }

  /**
   * Publishes the delivery's event. False when it isn't one, or the
   * repository isn't covered by an active installation an organization
   * connected.
   */
  async received(
    delivery: {
      id: string;
      deliveryId: string;
      event: string;
      action: string | null;
    },
    payload: GitHubIssuePayload,
  ): Promise<boolean> {
    const eventType = this.eventTypeOf(delivery.event, delivery.action);
    const issue = payload.issue;
    const login = payload.sender?.login;
    if (
      !eventType ||
      !issue ||
      !login ||
      payload.installation?.id === undefined ||
      payload.repository?.id === undefined
    ) {
      return false;
    }
    const installation = await this.installations.findByExternalId(
      String(payload.installation.id),
    );
    if (installation?.status !== 'active') {
      return false;
    }
    const repository = await this.repositories.findByExternalId(
      installation.id,
      String(payload.repository.id),
    );
    if (repository?.status !== 'available') {
      return false;
    }

    const fromAetherOs =
      payload.sender?.type === 'Bot' && login === this.botLogin();
    // GitHub is asked outside the transaction; null when it can't answer.
    const authorPermission = fromAetherOs
      ? null
      : await this.permissionOf(
          installation.externalId,
          repository.fullName,
          login,
        );
    await this.publish(eventType, delivery, installation.organizationId, {
      repositoryId: repository.id,
      repository: repository.fullName,
      ...(await this.projectLinks(repository.id)),
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      isPullRequest: issue.pull_request !== undefined,
      labels: (issue.labels ?? []).map((label) => label.name),
      label: delivery.event === 'issues' ? (payload.label?.name ?? null) : null,
      commentId: payload.comment ? String(payload.comment.id) : null,
      author: { login, type: payload.sender?.type ?? 'User' },
      authorPermission,
      fromAetherOs,
    });
    return true;
  }

  /** The projects the repository is linked to, and the links (a task's `repository.linkId`). */
  private async projectLinks(repositoryId: string) {
    const links = await this.links.linksOf(repositoryId);
    return { projectIds: links.map((link) => link.projectId), links };
  }

  @Transactional()
  private async publish(
    eventType: IssueEventType,
    delivery: { id: string; deliveryId: string },
    organizationId: string,
    fields: Omit<GithubIssueOpened, 'webhookDeliveryId' | 'deliveryId'>,
  ): Promise<void> {
    await this.events.emit({
      eventType,
      // Each delivery is its own event: none replaces another.
      aggregateId: delivery.id,
      aggregateVersion: 1,
      organizationId,
      payload: {
        webhookDeliveryId: delivery.id,
        deliveryId: delivery.deliveryId,
        ...fields,
      },
    });
  }

  private async permissionOf(
    installationId: string,
    repository: string,
    login: string,
  ): Promise<RepositoryPermission | null> {
    try {
      return await this.github.repositoryPermission(
        installationId,
        repository,
        login,
      );
    } catch (error) {
      if (!(error instanceof GitHubUnavailableError)) throw error;
      // Published anyway, as untrusted: losing the event would be worse.
      this.logger.warn(
        `${login}'s permission on ${repository} couldn't be read: ${error.message}`,
      );
      return null;
    }
  }

  private botLogin(): string {
    return `${this.config.get('GITHUB_APP_SLUG', { infer: true }) ?? ''}[bot]`;
  }
}
