export const EVENTS_OPTIONS = Symbol('EVENTS_OPTIONS');
export const RELAY_OPTIONS = Symbol('RELAY_OPTIONS');

export interface EventsOptions {
  /** The producing service, e.g. `polis`: local events are `<service>.<eventType>`, published to `<service>.events`. */
  service: string;
  /**
   * Event types that go to RabbitMQ (the service's AsyncAPI spec lists them).
   * Others stay in-process.
   */
  publish: readonly string[];
}

export interface RelayOptions {
  /** AMQP URL of RabbitMQ. */
  url: string;
  /** How often the relay looks for unpublished events; 0 disables the timer (tests call `relayBatch`). */
  intervalMs?: number;
  /** Events per batch. */
  batchSize?: number;
  /** How long published events stay in the outbox before they're deleted. */
  retentionMs?: number;
}

export interface EventsModuleOptions extends EventsOptions {
  /**
   * Relay to RabbitMQ, configured from the service's settings. Leave out to
   * only store events (they're published once a relay runs).
   */
  relay?: {
    inject?: (string | symbol | (abstract new (...args: never[]) => unknown))[];
    useFactory: (...args: never[]) => RelayOptions | Promise<RelayOptions>;
  };
}
