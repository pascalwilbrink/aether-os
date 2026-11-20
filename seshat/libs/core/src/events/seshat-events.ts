/**
 * The events Seshat publishes to `seshat.events` (routing key = event
 * type). Types are generated from ../contracts/seshat.asyncapi.yaml into
 * ./generated (`pnpm generate:api`); change the spec, not these types.
 * Local handlers listen to `seshat.<eventType>`.
 */
export * from './generated/seshat-events.gen.js';

import { SESHAT_EVENT_TYPES } from './generated/seshat-events.gen.js';

/** Every Seshat event in the spec goes to RabbitMQ. */
export const SESHAT_PUBLISHED_EVENTS: readonly string[] = SESHAT_EVENT_TYPES;
