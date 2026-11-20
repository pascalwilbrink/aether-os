/**
 * The events Agora publishes to `agora.events` (routing key = event
 * type). Types are generated from ../contracts/agora.asyncapi.yaml into
 * ./generated (`pnpm generate:api`); change the spec, not these types.
 * Local handlers listen to `agora.<eventType>`.
 */
export * from './generated/agora-events.gen.js';

import { AGORA_EVENT_TYPES } from './generated/agora-events.gen.js';

/** Every Agora event in the spec goes to RabbitMQ. */
export const AGORA_PUBLISHED_EVENTS: readonly string[] = AGORA_EVENT_TYPES;
