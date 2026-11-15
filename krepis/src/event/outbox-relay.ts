import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThan } from 'typeorm';

import { RABBITMQ_OPTIONS, type RabbitMqOptions } from './events.options.js';
import { MessagePublisher } from './message-publisher.js';
import { OutboxMessageEntity } from './outbox-message.entity.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Publishes outbox rows in creation order, in batches. Each batch runs in its
 * own transaction and locks its rows with `FOR UPDATE SKIP LOCKED`, so
 * several instances share the work without publishing a row twice at the
 * same time. A row is marked published only after the broker confirmed it; a
 * failure is recorded (`attempts`, `lastError`) and retried on the next run.
 * Delivery is therefore at least once: consumers deduplicate on `eventId`.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly settings: {
    intervalMs: number;
    batchSize: number;
    retentionMs: number;
  };
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<unknown> | undefined;

  constructor(
    @Inject(RABBITMQ_OPTIONS) options: RabbitMqOptions,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publisher: MessagePublisher,
  ) {
    this.settings = {
      intervalMs: options.relayIntervalMs ?? 1000,
      batchSize: options.relayBatchSize ?? 100,
      retentionMs: options.outboxRetentionMs ?? 7 * DAY_MS,
    };
  }

  onApplicationBootstrap(): void {
    if (this.settings.intervalMs > 0) {
      this.timer = setInterval(() => this.tick(), this.settings.intervalMs);
    }
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  /** Publishes one batch; returns how many events were published. */
  async relayBatch(): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const outbox = manager.getRepository(OutboxMessageEntity);
      const rows = await outbox.find({
        where: { publishedAt: IsNull() },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: this.settings.batchSize,
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });

      let published = 0;
      for (const row of rows) {
        try {
          await this.publisher.publish({
            exchange: row.exchange,
            routingKey: row.routingKey,
            messageId: row.id,
            type: row.routingKey,
            body: row.message,
            headers: row.headers,
          });
          row.publishedAt = new Date();
          published++;
        } catch (error) {
          row.attempts += 1;
          row.lastError = (
            error instanceof Error ? error.message : String(error)
          ).slice(0, 1000);
          this.logger.warn(
            `Publishing ${row.routingKey} ${row.id} failed (attempt ${row.attempts}): ${row.lastError}`,
          );
        }
        await outbox.save(row);
      }

      return published;
    });
  }

  /** Deletes published events older than the retention period. */
  async prune(): Promise<void> {
    // NULLs never compare less than a date, so unpublished rows are kept.
    await this.dataSource.getRepository(OutboxMessageEntity).delete({
      publishedAt: LessThan(new Date(Date.now() - this.settings.retentionMs)),
    });
  }

  private tick(): void {
    if (this.running) {
      return;
    }
    this.running = (async () => {
      try {
        while ((await this.relayBatch()) === this.settings.batchSize) {
          // A full batch: there may be more waiting.
        }
        await this.prune();
      } catch (error) {
        this.logger.error(
          'Outbox relay run failed',
          error instanceof Error ? error.stack : String(error),
        );
      } finally {
        this.running = undefined;
      }
    })();
  }
}
