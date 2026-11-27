/**
 * The events Episteme publishes to `episteme.events` (routing key = event
 * type). Types are generated from ../contracts/episteme.asyncapi.yaml into
 * ./generated (`pnpm generate:api`); change the spec, not these types.
 * Local handlers listen to `episteme.<eventType>`.
 */
export * from './generated/episteme-events.gen.js';

import { EPISTEME_EVENT_TYPES } from './generated/episteme-events.gen.js';

/** Every Episteme event in the spec goes to RabbitMQ. */
export const EPISTEME_PUBLISHED_EVENTS: readonly string[] =
  EPISTEME_EVENT_TYPES;
