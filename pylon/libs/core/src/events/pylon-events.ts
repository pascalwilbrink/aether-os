/**
 * The events Pylon publishes to `pylon.events` (routing key = event
 * type). Types are generated from ../contracts/pylon.asyncapi.yaml into
 * ./generated (`pnpm generate:api`); change the spec, not these types.
 * Local handlers listen to `pylon.<eventType>`.
 */
export * from './generated/pylon-events.gen.js';

import { PYLON_EVENT_TYPES } from './generated/pylon-events.gen.js';

/** Every Pylon event in the spec goes to RabbitMQ. */
export const PYLON_PUBLISHED_EVENTS: readonly string[] = PYLON_EVENT_TYPES;
