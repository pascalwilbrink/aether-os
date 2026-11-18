import { Injectable, Logger } from '@nestjs/common';

import { BudgetsService } from '@hephaestus/models';
import { InvalidTaskTransitionError, TasksService } from '@hephaestus/tasks';

/** Paused tasks looked at per round, oldest first. */
const BATCH = 50;

/**
 * Paused tasks whose budgets have room again, raised or renewed (a new
 * month), go back to `queued` (docs/models.md: resuming puts them through
 * the normal concurrency rules again), with `task.resumed`. Runs each
 * runner round; instances racing for a task are fine: the second
 * transition is refused and skipped.
 */
@Injectable()
export class PausedTasks {
  private readonly logger = new Logger(PausedTasks.name);

  constructor(
    private readonly tasks: TasksService,
    private readonly budgets: BudgetsService,
  ) {}

  async resume(): Promise<number> {
    let resumed = 0;
    for (const task of await this.tasks.paused(BATCH)) {
      const scope = await this.budgets.exceeded({
        organizationId: task.organizationId,
        projectId: task.projectId,
        topLevelTaskId: task.topLevelTaskId,
      });
      if (scope) {
        continue;
      }
      try {
        await this.tasks.transition(
          task.organizationId,
          task.id,
          'resume',
          null,
          { reason: 'budget-available' },
        );
        resumed++;
      } catch (error) {
        if (!(error instanceof InvalidTaskTransitionError)) throw error;
        this.logger.debug(`Task ${task.id} was resumed or ended meanwhile`);
      }
    }
    return resumed;
  }
}
