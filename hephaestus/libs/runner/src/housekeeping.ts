import { Injectable, Logger } from '@nestjs/common';

import { Deliveries } from './deliveries.js';
import { PausedTasks } from './paused-tasks.js';

/**
 * What each runner round does outside executions: deliveries (pull requests
 * to open, branches to delete) and paused tasks to resume. A failure in one
 * is logged and doesn't stop the other, or the round.
 */
@Injectable()
export class Housekeeping {
  private readonly logger = new Logger(Housekeeping.name);

  constructor(
    private readonly deliveries: Deliveries,
    private readonly pausedTasks: PausedTasks,
  ) {}

  async run(): Promise<void> {
    await this.deliveries
      .run()
      .catch((error: unknown) =>
        this.logger.error(`Deliveries failed: ${String(error)}`),
      );
    await this.pausedTasks
      .resume()
      .catch((error: unknown) =>
        this.logger.error(`Resuming paused tasks failed: ${String(error)}`),
      );
  }
}
