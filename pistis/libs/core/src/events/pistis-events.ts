/**
 * The events Pistis publishes to `pistis.events` (routing key = event
 * type). Types are generated from ../contracts/pistis.asyncapi.yaml into
 * ./generated (`pnpm generate:api`); change the spec, not these types.
 * Local handlers listen to `pistis.<eventType>`.
 */
export * from './generated/pistis-events.gen.js';

import { PISTIS_EVENT_TYPES } from './generated/pistis-events.gen.js';

/** Every Pistis event in the spec goes to RabbitMQ. */
export const PISTIS_PUBLISHED_EVENTS: readonly string[] = PISTIS_EVENT_TYPES;
