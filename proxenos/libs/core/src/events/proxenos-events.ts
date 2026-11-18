/**
 * The events Proxenos publishes to `proxenos.events` (routing key = event
 * type). Types are generated from ../contracts/proxenos.asyncapi.yaml into
 * ./generated (`pnpm generate:api`); change the spec, not these types.
 * Local handlers listen to `proxenos.<eventType>`.
 */
export * from './generated/proxenos-events.gen.js';

import { PROXENOS_EVENT_TYPES } from './generated/proxenos-events.gen.js';

/** Every Proxenos event in the spec goes to RabbitMQ. */
export const PROXENOS_PUBLISHED_EVENTS: readonly string[] =
  PROXENOS_EVENT_TYPES;
