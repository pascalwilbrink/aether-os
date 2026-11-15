/**
 * The events Polis publishes to `polis.events` (routing key = event type).
 * Types are generated from ../contracts/polis.asyncapi.yaml into
 * ./generated (`pnpm generate:api`); change the spec, not these types.
 * Local handlers listen to `polis.<eventType>`.
 */
export * from './generated/polis-events.gen.js';

import type { PolisEventPayloads } from './generated/polis-events.gen.js';
import { POLIS_EVENT_TYPES } from './generated/polis-events.gen.js';

/** What every membership event carries. */
export type MembershipEventBase = PolisEventPayloads['membership.revoked'];
export type ProjectMembershipEventBase =
  PolisEventPayloads['project-membership.revoked'];

/** Every Polis event in the spec goes to RabbitMQ. */
export const POLIS_PUBLISHED_EVENTS: readonly string[] = POLIS_EVENT_TYPES;
