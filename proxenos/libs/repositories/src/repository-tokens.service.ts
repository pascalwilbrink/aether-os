import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AccessControl, type Env } from '@proxenos/core';
import { GitHubApp, type GitHubPermissions } from '@proxenos/github';
import {
  InstallationsService,
  RepositoryUnavailableError,
} from '@proxenos/installations';

import type { CreateRepositoryTokenRequest } from './dto/create-repository-token.request.js';
import type { RepositoryTokenResponse } from './dto/repository-token.response.js';
import { RepositoryLinksService } from './repository-links.service.js';

/**
 * What each access may do (docs/git.md, Credentials). Never `workflows`, so
 * nothing pushed with these can change `.github/workflows`.
 */
const PERMISSIONS: Record<'read' | 'write', GitHubPermissions> = {
  read: { contents: 'read', metadata: 'read' },
  write: { contents: 'write', pull_requests: 'write', metadata: 'read' },
};

/**
 * Short-lived GitHub installation tokens for one linked repository, for a
 * running task only (Hephaestus asks with the task's token). Never stored;
 * every one is logged (who, which repository, which access), never its value.
 */
@Injectable()
export class RepositoryTokensService {
  private readonly logger = new Logger(RepositoryTokensService.name);

  constructor(
    private readonly links: RepositoryLinksService,
    private readonly installations: InstallationsService,
    private readonly github: GitHubApp,
    private readonly access: AccessControl,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(
    organizationId: string,
    projectId: string,
    linkId: string,
    body: CreateRepositoryTokenRequest,
  ): Promise<RepositoryTokenResponse> {
    const principal = this.access.principal();
    if (!principal.taskId) {
      // `repository:token` alone would let a person get a GitHub token.
      throw new ForbiddenException(
        "Only a task's token gets repository tokens",
      );
    }
    const { repository } = await this.links.findById(
      organizationId,
      projectId,
      linkId,
    );
    if (repository.status !== 'available') {
      throw new RepositoryUnavailableError(repository.id);
    }
    const installation = await this.installations.findActive(
      organizationId,
      repository.installationId,
    );
    const { token, expiresAt } = await this.github.createToken(
      installation.externalId,
      repository.externalId,
      PERMISSIONS[body.access],
    );
    this.logger.log(
      `Token (${body.access}) for ${repository.fullName}, task ${principal.taskId} as ${principal.sub}`,
    );
    const base = this.config
      .get('GITHUB_URL', { infer: true })
      .replace(/\/$/, '');
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      access: body.access,
      repository: {
        fullName: repository.fullName,
        cloneUrl: `${base}/${repository.fullName}.git`,
        defaultBranch: repository.defaultBranch,
        apiUrl: this.config.get('GITHUB_API_URL', { infer: true }),
      },
      committer: await this.github.botIdentity(),
    };
  }
}
