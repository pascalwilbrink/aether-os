/**
 * The events Hephaestus publishes to `hephaestus.events` (routing key =
 * event type). Types are generated from ../contracts/hephaestus.asyncapi.yaml
 * into ./generated (`pnpm generate:api`); change the spec, not these types.
 * Local handlers listen to `hephaestus.<eventType>`.
 */
export * from './generated/hephaestus-events.gen.js';

import { HEPHAESTUS_EVENT_TYPES } from './generated/hephaestus-events.gen.js';

/** Every Hephaestus event in the spec goes to RabbitMQ. */
export const HEPHAESTUS_PUBLISHED_EVENTS: readonly string[] =
  HEPHAESTUS_EVENT_TYPES;
