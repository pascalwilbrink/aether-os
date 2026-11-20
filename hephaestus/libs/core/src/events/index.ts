/**
 * Polis's events, as Hephaestus consumes them: types generated from
 * ../contracts/polis.asyncapi.yaml (`pnpm generate:api`).
 */
export type * as PolisEvents from './generated/polis-events.gen.js';

/** Proxenos's events (../contracts/proxenos.asyncapi.yaml): pull requests. */
export type * as ProxenosEvents from './generated/proxenos-events.gen.js';

/**
 * Agora's events (../contracts/agora.asyncapi.yaml): agents and their
 * published versions, which Hephaestus keeps a copy of (libs/agents).
 */
export type * as AgoraEvents from './generated/agora-events.gen.js';

import type { AgentVersionPublished } from './generated/agora-events.gen.js';

/**
 * An agent version as Agora published it (immutable): what tasks pin and
 * the runner runs, from Hephaestus's copy.
 */
export type AgentVersion = AgentVersionPublished['version'];

/** Hephaestus's own events (../contracts/hephaestus.asyncapi.yaml). */
export type * as HephaestusEventTypes from './generated/hephaestus-events.gen.js';
export * from './hephaestus-events.js';
export * from './hephaestus-events.module.js';
export * from './hephaestus-events.service.js';
