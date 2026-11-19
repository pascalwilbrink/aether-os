export const EVENTS_OPTIONS = Symbol('EVENTS_OPTIONS');
export const RABBITMQ_OPTIONS = Symbol('RABBITMQ_OPTIONS');

/** Where a service's own commands arrive (docs/events.md): local events are `commands.<name>`. */
export const COMMANDS_SOURCE = 'commands';

export interface EventsOptions {
  /** This service, e.g. `polis`: its local events are `<service>.<eventType>`, published to `<service>.events`. */
  service: string;
  /**
   * Event types this service publishes to RabbitMQ (its AsyncAPI spec lists
   * them). Others stay in-process.
   */
  publish: readonly string[];
  /**
   * Events this service consumes, per producing service:
   * `{ polis: ['organization.suspended', …] }`. Each producer gets one
   * durable queue, `<service>.<producer>-events`, bound to those routing
   * keys; every event is deduplicated through the `inbox` table and emitted
   * locally as `<producer>.<eventType>` (handle it with `@OnDomainEvent`).
   */
  subscribe?: Readonly<Record<string, readonly string[]>>;
  /**
   * Commands this service accepts (docs/events.md, Commands): requests sent
   * to it, e.g. `['task.create']`. They arrive on its own direct exchange,
   * `<service>.commands`, in the durable queue `<service>.commands` bound to
   * those names, and are emitted locally as `commands.<name>` (handle them
   * with `@OnDomainEvent`). Unlike events, a command seen before is handed
   * to its handler again: its `eventId` is its idempotency key, so the
   * handler returns the same outcome (and can announce it again for a
   * sender that missed it) instead of repeating the work.
   */
  commands?: readonly string[];
}

export interface RabbitMqOptions {
  /** AMQP URL of RabbitMQ. */
  url: string;
  /** How often the relay publishes waiting outbox rows; 0 disables the timer (tests call `relayBatch`). */
  relayIntervalMs?: number;
  /** Outbox rows per relay batch. */
  relayBatchSize?: number;
  /** How long published outbox rows are kept. */
  outboxRetentionMs?: number;
  /** Unacknowledged messages a consumer holds at once. */
  prefetch?: number;
  /** Deliveries of a failing message before it goes to the dead-letter queue. */
  maxAttempts?: number;
  /** Delay before the first retry; doubles with each attempt. */
  retryDelayMs?: number;
}

export interface EventsModuleOptions extends EventsOptions {
  /**
   * RabbitMQ, configured from the service's settings: the outbox relay and,
   * with `subscribe`, the consumers. Leave out to only store and handle
   * events in-process (tests).
   */
  rabbitmq?: {
    inject?: (string | symbol | (abstract new (...args: never[]) => unknown))[];
    useFactory: (
      ...args: never[]
    ) => RabbitMqOptions | Promise<RabbitMqOptions>;
  };
}
