import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  findPage,
  HephaestusEvents,
  mapPage,
  Transactional,
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
  metadata?: Record<string, string>;
}

/** What an agent records (the kinds it can produce so far). */
export type NewArtifact = NewArtifactBase &
  (
    | { kind: 'text'; format: 'markdown' | 'plain'; content: string }
    | { kind: 'json'; schema?: string | null; content: unknown }
  );

/** The outcome of a succeeded execution. */
export interface ArtifactOutcome {
  primaryArtifactId: string;
  artifactIds: string[];
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
   * The execution succeeded: its pending artifacts become `final`, with one
   * primary. Without one marked primary, the agent's final answer becomes
   * the primary text artifact; without an answer, its latest artifact. Null
   * when it produced nothing at all (no outcome).
   */
  @Transactional()
  async complete(
    source: ArtifactSource,
    finalAnswer: string,
  ): Promise<ArtifactOutcome | null> {
    let pending = await this.pendingOf(source.executionId);
    if (!pending.some((artifact) => artifact.primary)) {
      if (finalAnswer.trim()) {
        await this.record(source, {
          kind: 'text',
          format: 'markdown',
          title: 'Answer',
          content: finalAnswer,
          primary: true,
        });
        pending = await this.pendingOf(source.executionId);
      } else if (pending.length > 0) {
        pending.at(-1)!.primary = true;
      } else {
        return null;
      }
    }
    for (const artifact of pending) {
      await this.changeStatus(artifact, 'final');
    }
    return {
      primaryArtifactId: pending.find((artifact) => artifact.primary)!.id,
      artifactIds: pending.map((artifact) => artifact.id),
    };
  }

  /**
   * The execution failed or stopped: its pending artifacts are `partial`,
   * kept for inspection, never primary.
   */
  @Transactional()
  async abandon(executionId: string): Promise<void> {
    for (const artifact of await this.pendingOf(executionId)) {
      artifact.primary = false;
      await this.changeStatus(artifact, 'partial');
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

  private async changeStatus(
    artifact: ArtifactEntity,
    to: ArtifactStatus,
  ): Promise<void> {
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
