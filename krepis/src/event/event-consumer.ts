import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { context, propagation } from '@opentelemetry/api';
import type { ConfirmChannel, ConsumeMessage, Options } from 'amqplib';

import { runWithTraceContext } from '../telemetry/trace-context.js';
import { InvalidEventError, parseEventEnvelope } from './event-envelope.js';
import { EventInbox } from './event-inbox.js';
import {
  EVENTS_OPTIONS,
  RABBITMQ_OPTIONS,
  type EventsOptions,
  type RabbitMqOptions,
} from './events.options.js';

type ChannelWrapper = ReturnType<
  AmqpConnection['managedConnection']['createChannel']
>;

const ATTEMPT_HEADER = 'x-attempt';
const ERROR_HEADER = 'x-last-error';

/**
 * Consumes the events a service subscribes to (docs/events.md). Per producer:
 *
 * - `<service>.<producer>-events`, durable, bound to `<producer>.events` with
 *   the subscribed routing keys;
 * - `<queue>.retry`: a failed message waits here (per-message TTL, doubling
 *   from `retryDelayMs`) and then dead-letters back into the queue;
 * - `<queue>.dead`: after `maxAttempts`, or at once for a message that isn't
 *   an event envelope, the message is parked here for inspection.
 *
 * A message is acknowledged only after it was handled, or after its copy is
 * safely in the retry or dead-letter queue, so a failure never blocks the
 * queue and nothing is lost. The trace context is restored from the AMQP
 * headers around the handlers.
 */
@Injectable()
export class EventConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumer.name);
  private channel: ChannelWrapper | undefined;

  constructor(
    @Inject(EVENTS_OPTIONS) private readonly events: EventsOptions,
    @Inject(RABBITMQ_OPTIONS) private readonly options: RabbitMqOptions,
    private readonly amqp: AmqpConnection,
    private readonly inbox: EventInbox,
  ) {}

  onApplicationBootstrap(): void {
    this.channel = this.amqp.managedConnection.createChannel({
      name: `${this.events.service}-consumer`,
      setup: (channel: ConfirmChannel) => this.setup(channel),
    });
  }

  /** Resolves once the queues exist and consumption has started. */
  async ready(): Promise<void> {
    await this.channel?.waitForConnect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
  }

  /** The queue a producer's events arrive in. */
  queueFor(source: string): string {
    return `${this.events.service}.${source}-events`;
  }

  private async setup(channel: ConfirmChannel): Promise<void> {
    await channel.prefetch(this.options.prefetch ?? 10);
    for (const [source, eventTypes] of Object.entries(
      this.events.subscribe ?? {},
    )) {
      const exchange = `${source}.events`;
      const queue = this.queueFor(source);
      await channel.assertExchange(exchange, 'topic', { durable: true });
      await channel.assertQueue(queue, { durable: true });
      await channel.assertQueue(`${queue}.retry`, {
        durable: true,
        deadLetterExchange: '',
        deadLetterRoutingKey: queue,
      });
      await channel.assertQueue(`${queue}.dead`, { durable: true });
      for (const eventType of eventTypes) {
        await channel.bindQueue(queue, exchange, eventType);
      }
      await channel.consume(queue, (message) => {
        if (message) {
          void this.handle(channel, source, queue, message);
        }
      });
    }
  }

  private async handle(
    channel: ConfirmChannel,
    source: string,
    queue: string,
    message: ConsumeMessage,
  ): Promise<void> {
    const headers = (message.properties.headers ?? {}) as Record<
      string,
      unknown
    >;
    const attempt = Number(headers[ATTEMPT_HEADER] ?? 1);
    const traceHeaders = Object.fromEntries(
      Object.entries(headers).filter(([, value]) => typeof value === 'string'),
    ) as Record<string, string>;

    try {
      const event = parseEventEnvelope(message.content);
      await context.with(
        propagation.extract(context.active(), traceHeaders),
        () =>
          runWithTraceContext(traceHeaders, () =>
            this.inbox.receive(source, event),
          ),
      );
      channel.ack(message);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const retry =
        !(error instanceof InvalidEventError) &&
        attempt < (this.options.maxAttempts ?? 5);
      try {
        await this.forward(
          channel,
          retry ? `${queue}.retry` : `${queue}.dead`,
          message,
          {
            ...headers,
            [ATTEMPT_HEADER]: retry ? attempt + 1 : attempt,
            [ERROR_HEADER]: reason.slice(0, 500),
          },
          retry
            ? (this.options.retryDelayMs ?? 1000) * 2 ** (attempt - 1)
            : undefined,
        );
        channel.ack(message);
        this.logger.warn(
          `${source} event ${message.properties.messageId ?? '?'} failed (attempt ${attempt}); ${retry ? 'will retry' : 'dead-lettered'}: ${reason}`,
        );
      } catch (forwardError) {
        // Couldn't park it: let RabbitMQ redeliver it later.
        channel.nack(message, false, true);
        this.logger.error(
          `Could not forward a failed ${source} event`,
          forwardError instanceof Error
            ? forwardError.stack
            : String(forwardError),
        );
      }
    }
  }

  /** Republishes a copy and waits for the broker's confirm. */
  private forward(
    channel: ConfirmChannel,
    queue: string,
    message: ConsumeMessage,
    headers: Record<string, unknown>,
    delayMs: number | undefined,
  ): Promise<void> {
    const { messageId, type, contentType, timestamp } = message.properties;
    const options: Options.Publish = {
      messageId,
      type,
      contentType,
      timestamp,
      persistent: true,
      headers,
      ...(delayMs !== undefined ? { expiration: String(delayMs) } : {}),
    };

    return new Promise((resolve, reject) => {
      channel.sendToQueue(queue, message.content, options, (error) =>
        error ? reject(error) : resolve(),
      );
    });
  }
}
