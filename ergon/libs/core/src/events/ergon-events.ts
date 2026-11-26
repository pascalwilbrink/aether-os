/**
 * The events Ergon publishes to `ergon.events` (routing key = event
 * type). Types are generated from ../contracts/ergon.asyncapi.yaml into
 * ./generated (`pnpm generate:api`); change the spec, not these types.
 * Local handlers listen to `ergon.<eventType>`.
 */
export * from './generated/ergon-events.gen.js';

import { ERGON_EVENT_TYPES } from './generated/ergon-events.gen.js';

/** Every Ergon event in the spec goes to RabbitMQ. */
export const ERGON_PUBLISHED_EVENTS: readonly string[] = ERGON_EVENT_TYPES;
