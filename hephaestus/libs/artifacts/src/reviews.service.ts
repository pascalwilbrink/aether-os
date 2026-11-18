import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  Transactional,
  type ApiTypes,
  type Env,
} from '@hephaestus/core';
import { TasksService } from '@hephaestus/tasks';
import { ProjectsService } from '@hephaestus/tenancy';

import { ArtifactEntity } from './artifact.entity.js';
import {
  ArtifactNotDraftError,
  TaskReviewRoundsExhaustedError,
} from './artifact.errors.js';
import { ArtifactsService } from './artifacts.service.js';
import type { ArtifactResponse } from './dto/artifact.response.js';

type Decision = ApiTypes.ArtifactReview['decision'];

const STATUS: Record<Decision, 'final' | 'rejected' | 'changes_requested'> = {
  approved: 'final',
  rejected: 'rejected',
  changes_requested: 'changes_requested',
};

/**
 * Reviews of drafts (docs/tasks.md, Request changes), by people with
 * `task:approve`. Each draft is decided on its own; the task moves on once
 * it can:
 *
 * - a rejected draft fails the task (`rejected`; its other drafts become
 *   `partial`);
 * - otherwise it waits while drafts are undecided; then, if any was sent
 *   back, the agent runs again with the comments (`revise`), else it
 *   succeeds with every final artifact and its last round's primary one.
 *
 * Approving makes a draft `final` at once: delivered, like any final
 * artifact, whatever happens to the task afterwards.
 */
@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(ArtifactEntity)
    private readonly artifacts: Repository<ArtifactEntity>,
    private readonly artifactsService: ArtifactsService,
    private readonly tasks: TasksService,
    private readonly projects: ProjectsService,
    private readonly access: AccessControl,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Transactional()
  async decide(
    organizationId: string,
    projectId: string,
    taskId: string,
    artifactId: string,
    decision: Decision,
    comments: ApiTypes.ReviewComment[],
  ): Promise<ArtifactResponse> {
    await this.projects.assertAcceptsWrites(organizationId, projectId);
    const task = await this.tasks.findById(organizationId, projectId, taskId);
    const artifact = await this.artifacts.findOne({
      where: { id: artifactId, taskId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!artifact) {
      throw new NotFoundException(`Artifact ${artifactId} not found`);
    }
    if (artifact.status !== 'draft') {
      throw new ArtifactNotDraftError(artifact.id, artifact.status);
    }
    const maxRounds = this.config.get('REVIEW_MAX_ROUNDS', { infer: true });
    if (decision === 'changes_requested' && task.reviewRound >= maxRounds) {
      throw new TaskReviewRoundsExhaustedError(task.id, maxRounds);
    }

    artifact.review = {
      decision,
      comments,
      decidedBy: this.access.principal().sub,
      decidedAt: new Date().toISOString(),
    };
    await this.artifactsService.setStatus(artifact, STATUS[decision]);

    if (decision === 'rejected') {
      await this.tasks.transition(organizationId, taskId, 'fail', 'rejected', {
        reason: 'draft-rejected',
      });
    } else {
      await this.moveOn(organizationId, taskId, artifact.executionId);
    }
    return this.artifactsService.findById(
      organizationId,
      projectId,
      taskId,
      artifactId,
    );
  }

  /** After a decision that didn't end the task: wait, revise or succeed. */
  private async moveOn(
    organizationId: string,
    taskId: string,
    executionId: string,
  ): Promise<void> {
    const undecided = await this.artifacts.count({
      where: { taskId, status: 'draft' },
    });
    if (undecided > 0) {
      return;
    }
    const round = await this.artifacts.find({
      where: { executionId },
      select: { id: true, status: true, primary: true },
    });
    if (round.some((artifact) => artifact.status === 'changes_requested')) {
      await this.tasks.transition(organizationId, taskId, 'revise', null, {
        reason: 'changes-requested',
      });
      return;
    }
    const primary = round.find(
      (artifact) => artifact.primary && artifact.status === 'final',
    )!;
    await this.tasks.transition(organizationId, taskId, 'deliver', null, {
      reason: 'approved',
    });
    if (
      (await this.artifactsService.undeliveredPullRequests(taskId)).length > 0
    ) {
      // A pull request to open: the runner delivers it, then succeeds.
      return;
    }
    await this.tasks.transition(organizationId, taskId, 'succeed', null, {
      reason: 'nothing-to-deliver',
      outcome: {
        primaryArtifactId: primary.id,
        artifactIds: await this.artifactsService.finalIds(taskId),
      },
    });
  }
}
