import { Injectable } from '@nestjs/common';

import type { TaskResponse } from '@hephaestus/tasks';

import {
  RepositoryTokens,
  type RepositoryCredentials,
} from './repository-tokens.js';
import { TaskTokens } from './task-tokens.js';

/**
 * A write token for a task's repository outside an execution (delivery,
 * branch cleanup): a short task token first (Pistis), then Proxenos's
 * repository token for it.
 */
@Injectable()
export class TaskRepositoryAccess {
  constructor(
    private readonly taskTokens: TaskTokens,
    private readonly repositoryTokens: RepositoryTokens,
  ) {}

  async write(task: TaskResponse): Promise<RepositoryCredentials> {
    const token = await this.taskTokens.issue({
      serviceAccountId: task.serviceAccountId,
      organizationId: task.organizationId,
      projectId: task.projectId,
      taskId: task.id,
      expiresInSeconds: 600,
    });
    return this.repositoryTokens.issue(task, token, 'write');
  }
}
