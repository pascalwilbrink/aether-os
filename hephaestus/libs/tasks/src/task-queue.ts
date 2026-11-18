import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { Transactional } from '@hephaestus/core';
import { ProjectsService } from '@hephaestus/tenancy';

import type { TaskResponse } from './dto/task.response.js';
import { TaskEntity } from './task.entity.js';
import { COUNTING } from './task-transitions.js';
import { TasksService } from './tasks.service.js';

export interface ConcurrencyLimits {
  /** Tasks in a counting state per organization (docs/tasks.md, Concurrency). */
  perOrganization: number;
  /** The same per project. */
  perProject: number;
}

/** How many candidates one claim looks at before giving up for this round. */
const MAX_CANDIDATES = 25;

/**
 * The queue of tasks ready to start (docs/tasks.md, Concurrency). Several
 * Hephaestus instances claim from it at once: a candidate is locked with
 * `FOR UPDATE SKIP LOCKED`, so two never take the same task, and the
 * concurrency counts are taken under a per-organization advisory lock, so
 * two claims in one organization can't both see the last free slot.
 */
@Injectable()
export class TaskQueue {
  private readonly logger = new Logger(TaskQueue.name);

  constructor(
    @InjectRepository(TaskEntity)
    private readonly tasks: Repository<TaskEntity>,
    private readonly tasksService: TasksService,
    private readonly projects: ProjectsService,
  ) {}

  /**
   * Moves the next startable task to `provisioning` and returns it, or null.
   *
   * - Ready: `queued`, and its backoff (`nextAttemptAt`) has passed.
   * - Fair: the organization with the fewest running tasks first (round-robin
   *   across tenants), then subtasks before top-level tasks (started trees
   *   finish first), then oldest first.
   * - Within the limits, and only in an active organization and project; a
   *   task that can't start now stays queued and the next candidate is tried.
   *
   * Part of the caller's transaction, so the claim and what the caller
   * records with it (the execution) commit together.
   */
  @Transactional()
  async claimNext(limits: ConcurrencyLimits): Promise<TaskResponse | null> {
    const skippedOrganizations: string[] = [];
    const skippedProjects: string[] = [];

    for (let i = 0; i < MAX_CANDIDATES; i++) {
      const [candidate] = (await this.tasks.query(
        `SELECT t.id, t.organization_id, t.project_id
           FROM tasks t
          WHERE t.status = 'queued'
            AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= now())
            AND NOT (t.organization_id = ANY($1::uuid[]))
            AND NOT (t.project_id = ANY($2::uuid[]))
          ORDER BY (SELECT count(*) FROM tasks c
                     WHERE c.organization_id = t.organization_id
                       AND c.status = ANY($3::text[])),
                   (t.parent_task_id IS NULL),
                   t.created_at,
                   t.id
          LIMIT 1
          FOR UPDATE OF t SKIP LOCKED`,
        [skippedOrganizations, skippedProjects, COUNTING],
      )) as { id: string; organization_id: string; project_id: string }[];
      if (!candidate) {
        return null;
      }
      const organizationId = candidate.organization_id;
      const projectId = candidate.project_id;

      await this.tasks.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`hephaestus:tasks:${organizationId}`],
      );
      const [{ organization, project }] = (await this.tasks.query(
        `SELECT count(*)::int AS organization,
                count(*) FILTER (WHERE project_id = $2)::int AS project
           FROM tasks
          WHERE organization_id = $1 AND status = ANY($3::text[])`,
        [organizationId, projectId, COUNTING],
      )) as { organization: number; project: number }[];
      if (organization >= limits.perOrganization) {
        skippedOrganizations.push(organizationId);
        continue;
      }
      if (project >= limits.perProject) {
        skippedProjects.push(projectId);
        continue;
      }

      try {
        await this.projects.assertAcceptsWrites(organizationId, projectId);
      } catch (error) {
        // Suspended, archived, or Polis unreachable: not now.
        this.logger.debug(
          `Not starting tasks in project ${projectId}: ${String(error)}`,
        );
        skippedProjects.push(projectId);
        continue;
      }

      return this.tasksService.transition(
        organizationId,
        candidate.id,
        'provision',
      );
    }
    return null;
  }

  /**
   * The next `delivering` task whose delivery is due, leased to the caller
   * for `leaseMs` (another runner won't take it meanwhile), with how many
   * times delivery has been tried, this one included.
   */
  @Transactional()
  async claimDelivery(
    leaseMs: number,
  ): Promise<{ task: TaskResponse; attempt: number } | null> {
    // An UPDATE … RETURNING answers [rows, affected] on Postgres.
    const [[row]] = (await this.tasks.query(
      `UPDATE tasks
          SET next_attempt_at = now() + make_interval(secs => $1::double precision / 1000),
              delivery_attempts = delivery_attempts + 1
        WHERE id = (SELECT id FROM tasks
                     WHERE status = 'delivering'
                       AND (next_attempt_at IS NULL OR next_attempt_at <= now())
                     ORDER BY updated_at, id
                     LIMIT 1
                     FOR UPDATE SKIP LOCKED)
       RETURNING id, delivery_attempts`,
      [leaseMs],
    )) as [{ id: string; delivery_attempts: number }[], number];
    if (!row) {
      return null;
    }
    return {
      task: await this.tasksService.get(row.id),
      attempt: row.delivery_attempts,
    };
  }

  /** The next top-level task whose branch should go, leased for `leaseMs`. */
  @Transactional()
  async claimBranchCleanup(leaseMs: number): Promise<TaskResponse | null> {
    const [[row]] = (await this.tasks.query(
      `UPDATE tasks
          SET branch_cleanup_at = now() + make_interval(secs => $1::double precision / 1000)
        WHERE id = (SELECT id FROM tasks
                     WHERE branch_cleanup_at <= now()
                     ORDER BY branch_cleanup_at, id
                     LIMIT 1
                     FOR UPDATE SKIP LOCKED)
       RETURNING id`,
      [leaseMs],
    )) as [{ id: string }[], number];
    return row ? this.tasksService.get(row.id) : null;
  }
}
