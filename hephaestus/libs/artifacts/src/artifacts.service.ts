import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, type Repository } from 'typeorm';

import {
  findPage,
  HephaestusEvents,
  mapPage,
  OnDomainEvent,
  Transactional,
  type ApiTypes,
  type DomainEvent,
  type HephaestusEventTypes,
  type Page,
} from '@hephaestus/core';
import { TasksService } from '@hephaestus/tasks';

import { ArtifactEntity, type ArtifactStatus } from './artifact.entity.js';
import { ArtifactRejectedError } from './artifact.errors.js';
import { ArtifactMapper } from './artifact.mapper.js';
import type { ArtifactResponse } from './dto/artifact.response.js';
import type { ListArtifactsQuery } from './dto/list-artifacts.query.js';

/** Where an artifact comes from: copied onto it. */
export interface ArtifactSource {
  organizationId: string;
  projectId: string;
  taskId: string;
  executionId: string;
  agentVersionId: string;
}

interface NewArtifactBase {
  title: string;
  /** The task's outcome; the last one marked primary wins. */
  primary?: boolean;
  /** For a revision: the artifact a reviewer sent back that it replaces. */
  revisionOf?: string;
  metadata?: Record<string, string>;
}

/** What an agent records (the kinds it can produce so far). */
export type NewArtifact = NewArtifactBase &
  (
    | { kind: 'text'; format: 'markdown' | 'plain'; content: string }
    | { kind: 'json'; schema?: string | null; content: unknown }
  );

/** A round of checks, recorded by Hephaestus (never by the agent). */
export interface NewVerification {
  kind: 'verification';
  title: string;
  primary?: false;
  metadata?: Record<string, string>;
  round: number;
  results: ApiTypes.CriterionResult[];
}

/** Marks the text artifact made from the agent's final answer. */
const FINAL_ANSWER = 'aether-os.final-answer';

/** What a completed execution produced (one review round). */
export interface ArtifactOutcome {
  primaryArtifactId: string;
  /** Final at once: they need no approval. */
  artifactIds: string[];
  /** Waiting for approval; none means the task can succeed. */
  draftArtifactIds: string[];
}

/** Content is stored inline up to this size (UTF-8 bytes); Loculus later. */
export const MAX_CONTENT_BYTES = 256 * 1024;
/** Artifacts one execution may record. */
export const MAX_ARTIFACTS_PER_EXECUTION = 50;

/**
 * Artifacts (docs/tasks.md, Artifacts): what tasks produce. An agent
 * records them while its execution runs (`pending`); when the execution
 * ends they become `final` (the task succeeded, with exactly one primary
 * artifact) or `partial` (it failed). Content never changes; status changes
 * emit `artifact.status-changed`.
 */
@Injectable()
export class ArtifactsService {
  constructor(
    @InjectRepository(ArtifactEntity)
    private readonly artifacts: Repository<ArtifactEntity>,
    private readonly mapper: ArtifactMapper,
    private readonly tasks: TasksService,
    private readonly events: HephaestusEvents,
  ) {}

  /**
   * Records an artifact for a running execution (the caller checks that it
   * runs). Throws `ArtifactRejectedError` past the limits.
   */
  @Transactional()
  async record(
    source: ArtifactSource,
    input: NewArtifact,
  ): Promise<ArtifactResponse> {
    const size =
      input.kind === 'text'
        ? Buffer.byteLength(input.content)
        : Buffer.byteLength(JSON.stringify(input.content ?? null));
    if (size > MAX_CONTENT_BYTES) {
      throw new ArtifactRejectedError(
        `The content is ${size} bytes; at most ${MAX_CONTENT_BYTES} are allowed`,
      );
    }
    if (input.revisionOf) {
      const revised = await this.artifacts.findOneBy({
        id: input.revisionOf,
        taskId: source.taskId,
        status: 'changes_requested',
      });
      if (!revised) {
        throw new ArtifactRejectedError(
          'revises must name an artifact of this task a reviewer sent back',
        );
      }
    }
    const recorded = await this.artifacts.count({
      where: { executionId: source.executionId },
    });
    if (recorded >= MAX_ARTIFACTS_PER_EXECUTION) {
      throw new ArtifactRejectedError(
        `At most ${MAX_ARTIFACTS_PER_EXECUTION} artifacts per execution`,
      );
    }

    if (input.primary) {
      // Pending artifacts aren't anything yet: only one can be the outcome.
      await this.artifacts.update(
        { executionId: source.executionId, status: 'pending', primary: true },
        { primary: false },
      );
    }
    const entity = this.mapper.toEntity(source, input, new Date());
    await this.artifacts.insert(
      entity as Parameters<Repository<ArtifactEntity>['insert']>[0],
    );
    await this.events.emit({
      eventType: 'artifact.created',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      payload: {
        artifactId: entity.id,
        taskId: entity.taskId,
        executionId: entity.executionId,
        kind: entity.kind,
        status: entity.status,
        primary: entity.primary,
      },
    });
    return this.mapper.toResponse(entity);
  }

  /**
   * Makes sure the execution has its outcome: one primary artifact. The one
   * the agent marked; else its final answer, as a text artifact (`Answer`;
   * a later answer replaces an earlier one, which becomes `partial`; in a
   * revision run it revises the `Answer` a reviewer sent back); else
   * its latest artifact. False when there is nothing at all. Verification
   * artifacts are never the outcome.
   */
  @Transactional()
  async settle(source: ArtifactSource, finalAnswer: string): Promise<boolean> {
    const outcomes = (await this.pendingOf(source.executionId)).filter(
      (artifact) => artifact.kind !== 'verification',
    );
    const primary = outcomes.find((artifact) => artifact.primary);
    const isAnswer = primary?.metadata[FINAL_ANSWER] === 'true';
    if (primary && !isAnswer) {
      return true;
    }
    if (finalAnswer.trim()) {
      if (primary) {
        if ((primary.body as { content?: unknown }).content === finalAnswer) {
          return true;
        }
        primary.primary = false;
        await this.setStatus(primary, 'partial');
      }
      // A revision run's answer revises the answer a reviewer sent back.
      const sentBack = (await this.revisionRequests(source.taskId)).find(
        (artifact) => artifact.metadata[FINAL_ANSWER] === 'true',
      );
      await this.record(source, {
        kind: 'text',
        format: 'markdown',
        title: 'Answer',
        content: finalAnswer,
        primary: true,
        metadata: { [FINAL_ANSWER]: 'true' },
        revisionOf: sentBack?.id,
      });
      return true;
    }
    if (primary) {
      return true;
    }
    const latest = outcomes.at(-1);
    if (!latest) {
      return false;
    }
    latest.primary = true;
    await this.artifacts.save(latest);
    return true;
  }

  /**
   * The execution completed: its pending artifacts become `draft` if their
   * kind needs approval (`reviewKinds`, `*` for all; never verification
   * artifacts), else `final`. Settles the outcome first (`settle`); null
   * when there is none.
   */
  @Transactional()
  async complete(
    source: ArtifactSource,
    finalAnswer: string,
    reviewKinds: string[] = [],
  ): Promise<ArtifactOutcome | null> {
    if (!(await this.settle(source, finalAnswer))) {
      return null;
    }
    const pending = await this.pendingOf(source.executionId);
    const needsReview = (kind: string) =>
      kind !== 'verification' &&
      (reviewKinds.includes('*') || reviewKinds.includes(kind));
    for (const artifact of pending) {
      await this.setStatus(
        artifact,
        needsReview(artifact.kind) ? 'draft' : 'final',
      );
    }
    return {
      primaryArtifactId: pending.find((artifact) => artifact.primary)!.id,
      artifactIds: pending
        .filter((artifact) => artifact.status === 'final')
        .map((artifact) => artifact.id),
      draftArtifactIds: pending
        .filter((artifact) => artifact.status === 'draft')
        .map((artifact) => artifact.id),
    };
  }

  /** Records a round of checks (`pending`, like the run's other artifacts). */
  @Transactional()
  async recordVerification(
    source: ArtifactSource,
    round: number,
    results: ApiTypes.CriterionResult[],
  ): Promise<string> {
    const entity = this.mapper.toEntity(
      source,
      {
        kind: 'verification',
        title: `Verification, round ${round}`,
        round,
        results,
      },
      new Date(),
    );
    await this.artifacts.insert(
      entity as Parameters<Repository<ArtifactEntity>['insert']>[0],
    );
    await this.events.emit({
      eventType: 'artifact.created',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      payload: {
        artifactId: entity.id,
        taskId: entity.taskId,
        executionId: entity.executionId,
        kind: entity.kind,
        status: entity.status,
        primary: false,
      },
    });
    return entity.id;
  }

  /**
   * What checks look at: the execution's pending artifacts and the task's
   * final ones (e.g. approved in an earlier review round), without
   * verification artifacts.
   */
  async forVerification(
    taskId: string,
    executionId: string,
  ): Promise<ArtifactResponse[]> {
    const found = await this.artifacts.find({
      where: [
        { executionId, status: 'pending', kind: Not('verification') },
        { taskId, status: 'final', kind: Not('verification') },
      ],
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return found.map((artifact) => this.mapper.toResponse(artifact));
  }

  /** Every final artifact of the task, oldest first (its outcome's list). */
  async finalIds(taskId: string): Promise<string[]> {
    return (
      await this.artifacts.find({
        where: { taskId, status: 'final' },
        order: { createdAt: 'ASC', id: 'ASC' },
        select: { id: true },
      })
    ).map((artifact) => artifact.id);
  }

  /**
   * What reviewers sent back and the agent hasn't revised yet: the input of
   * a revision run, with the reviewers' comments (`review`).
   */
  async revisionRequests(taskId: string): Promise<ArtifactResponse[]> {
    const sentBack = await this.artifacts.find({
      where: { taskId, status: 'changes_requested' },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    if (sentBack.length === 0) {
      return [];
    }
    const revised = new Set(
      (
        await this.artifacts.find({
          where: {
            taskId,
            revisionOf: In(sentBack.map((artifact) => artifact.id)),
            status: Not('partial'),
          },
          select: { id: true, revisionOf: true },
        })
      ).map((artifact) => artifact.revisionOf),
    );
    return sentBack
      .filter((artifact) => !revised.has(artifact.id))
      .map((artifact) => this.mapper.toResponse(artifact));
  }

  /**
   * A task that failed or was cancelled leaves nothing waiting: its drafts
   * and pending artifacts become `partial` (docs/tasks.md, Status). Final
   * ones stay final: delivery isn't undone.
   */
  @OnDomainEvent('hephaestus.task.failed')
  @OnDomainEvent('hephaestus.task.cancelled')
  async onTaskEnded(
    event: DomainEvent<
      HephaestusEventTypes.TaskFailed | HephaestusEventTypes.TaskCancelled
    >,
  ): Promise<void> {
    const left = await this.artifacts.find({
      where: {
        taskId: event.payload.taskId,
        status: In(['draft', 'pending']),
      },
      order: { createdAt: 'ASC', id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    for (const artifact of left) {
      artifact.primary = false;
      await this.setStatus(artifact, 'partial');
    }
  }

  /**
   * The execution failed or stopped: its pending artifacts are `partial`,
   * kept for inspection, never primary.
   */
  @Transactional()
  async abandon(executionId: string): Promise<void> {
    for (const artifact of await this.pendingOf(executionId)) {
      artifact.primary = false;
      await this.setStatus(artifact, 'partial');
    }
  }

  async list(
    organizationId: string,
    projectId: string,
    taskId: string,
    query: ListArtifactsQuery,
  ): Promise<Page<ArtifactResponse>> {
    // 404 for another organization's or project's task.
    await this.tasks.findById(organizationId, projectId, taskId);
    const { status, ...page } = query;
    const entities = await findPage(
      this.artifacts,
      {
        where: { taskId, ...(status ? { status } : {}) },
        sortBy: 'createdAt',
        direction: 'ASC',
      },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    projectId: string,
    taskId: string,
    artifactId: string,
  ): Promise<ArtifactResponse> {
    await this.tasks.findById(organizationId, projectId, taskId);
    const entity = await this.artifacts.findOneBy({ id: artifactId, taskId });
    if (!entity) {
      throw new NotFoundException(`Artifact ${artifactId} not found`);
    }
    return this.mapper.toResponse(entity);
  }

  private pendingOf(executionId: string): Promise<ArtifactEntity[]> {
    return this.artifacts.find({
      where: { executionId, status: 'pending' },
      order: { createdAt: 'ASC', id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Changes an artifact's status (and saves what else changed on it), with
   * its `artifact.status-changed` event. Within this library only.
   */
  async setStatus(artifact: ArtifactEntity, to: ArtifactStatus): Promise<void> {
    const from = artifact.status;
    artifact.status = to;
    artifact.updatedAt = new Date();
    artifact.version += 1;
    await this.artifacts.save(artifact);
    await this.events.emit({
      eventType: 'artifact.status-changed',
      aggregateId: artifact.id,
      aggregateVersion: artifact.version,
      organizationId: artifact.organizationId,
      projectId: artifact.projectId,
      payload: {
        artifactId: artifact.id,
        taskId: artifact.taskId,
        from,
        to,
        revisionOf: artifact.revisionOf,
      },
    });
  }
}
