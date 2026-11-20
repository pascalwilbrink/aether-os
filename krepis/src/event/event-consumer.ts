import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import type { ConfirmChannel, ConsumeMessage, Options } from 'amqplib';

import { runWithLogContext } from '../logging/log-context.js';
import { runWithTraceContext } from '../telemetry/trace-context.js';
import { InvalidEventError, parseEventEnvelope } from './event-envelope.js';
import { EventInbox } from './event-inbox.js';
import {
  COMMANDS_SOURCE,
  EVENTS_OPTIONS,
  RABBITMQ_OPTIONS,
  type EventsOptions,
  type RabbitMqOptions,
} from './events.options.js';

/** Krepis's own spans (no-ops while no OpenTelemetry SDK runs). */
const tracer = trace.getTracer('@aether-os/krepis');

type ChannelWrapper = ReturnType<
  AmqpConnection['managedConnection']['createChannel']
>;

const ATTEMPT_HEADER = 'x-attempt';
const ERROR_HEADER = 'x-last-error';

/**
 * Consumes the events a service subscribes to and the commands it accepts
 * (docs/events.md). Per producer, and once for commands:
 *
 * - the queue: `<service>.<producer>-events`, durable, bound to the topic
 *   exchange `<producer>.events` with the subscribed routing keys; for
 *   commands `<service>.commands`, bound to the service's own direct
 *   exchange `<service>.commands` with the command names;
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

  /** The queue this service's commands arrive in. */
  commandQueue(): string {
    return `${this.events.service}.commands`;
  }

  private async setup(channel: ConfirmChannel): Promise<void> {
    await channel.prefetch(this.options.prefetch ?? 10);
    const sources = Object.entries(this.events.subscribe ?? {}).map(
      ([source, keys]) => ({
        source,
        exchange: `${source}.events`,
        type: 'topic',
        queue: this.queueFor(source),
        keys,
      }),
    );
    if (this.events.commands?.length) {
      sources.push({
        source: COMMANDS_SOURCE,
        exchange: `${this.events.service}.commands`,
        type: 'direct',
        queue: this.commandQueue(),
        keys: this.events.commands,
      });
    }
    for (const { source, exchange, type, queue, keys } of sources) {
      await channel.assertExchange(exchange, type, { durable: true });
      await channel.assertQueue(queue, { durable: true });
      await channel.assertQueue(`${queue}.retry`, {
        durable: true,
        deadLetterExchange: '',
        deadLetterRoutingKey: queue,
      });
      await channel.assertQueue(`${queue}.dead`, { durable: true });
      for (const key of keys) {
        await channel.bindQueue(queue, exchange, key);
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
      // A consumer span (when an SDK runs), child of the span that emitted
      // the event, so the handling shows up in the same trace.
      await tracer.startActiveSpan(
        `${queue} process`,
        {
          kind: SpanKind.CONSUMER,
          attributes: {
            'messaging.system': 'rabbitmq',
            'messaging.operation.type': 'process',
            'messaging.destination.name': queue,
            'messaging.message.id': event.eventId,
            'aether.event.type': event.eventType,
            ...(event.organizationId
              ? { 'aether.organization.id': event.organizationId }
              : {}),
            'messaging.rabbitmq.delivery_attempt': attempt,
          },
        },
        propagation.extract(context.active(), traceHeaders),
        async (span) => {
          try {
            // Every line logged while handling it carries the event's tenant.
            await runWithTraceContext(traceHeaders, () =>
              runWithLogContext(
                {
                  organizationId: event.organizationId,
                  projectId: event.projectId,
                  eventId: event.eventId,
                },
                () => this.inbox.receive(source, event),
              ),
            );
          } catch (error) {
            span.recordException(error as Error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          } finally {
            span.end();
          }
        },
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
