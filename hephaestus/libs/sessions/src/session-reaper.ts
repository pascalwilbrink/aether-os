import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';

import { SESSION_OPTIONS, type SessionOptions } from './session.options.js';
import { SessionsService } from './sessions.service.js';

/**
 * Ends sessions with no run for `SESSION_IDLE_TIMEOUT_MS` (`idle`), every
 * `SESSION_REAPER_INTERVAL_MS` (0: never; tests call `reap`).
 */
@Injectable()
export class SessionReaper
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SessionReaper.name);
  private timer: NodeJS.Timeout | undefined;
  private reaping: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly sessions: SessionsService,
    @Inject(SESSION_OPTIONS) private readonly options: SessionOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (this.options.reaperIntervalMs > 0) {
      this.timer = setInterval(() => {
        this.reaping = this.reap().catch((error: unknown) =>
          this.logger.warn(`Ending idle sessions failed: ${String(error)}`),
        );
      }, this.options.reaperIntervalMs);
      this.timer.unref();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.reaping;
  }

  /** Ends every idle session; how many. */
  async reap(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - this.options.idleTimeoutMs);
    const runStartedBefore = new Date(
      now.getTime() - this.options.runTimeoutMs,
    );
    let ended = 0;
    for (;;) {
      const batch = await this.sessions.endIdle(before, runStartedBefore);
      ended += batch;
      if (batch < 100) {
        return ended;
      }
    }
  }
}
