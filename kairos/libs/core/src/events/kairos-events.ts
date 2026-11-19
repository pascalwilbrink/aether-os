/**
 * The events Kairos publishes to `kairos.events` (routing key = event
 * type). Types are generated from ../contracts/kairos.asyncapi.yaml into
 * ./generated (`pnpm generate:api`); change the spec, not these types.
 * Local handlers listen to `kairos.<eventType>`.
 */
export * from './generated/kairos-events.gen.js';

import { KAIROS_EVENT_TYPES } from './generated/kairos-events.gen.js';

/** Every Kairos event in the spec goes to RabbitMQ. */
export const KAIROS_PUBLISHED_EVENTS: readonly string[] = KAIROS_EVENT_TYPES;
