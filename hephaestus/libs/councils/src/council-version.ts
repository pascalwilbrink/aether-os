import type { AgoraEvents } from '@hephaestus/core';

/** A council version as Agora publishes it (`council-version.published`). */
export type CouncilVersion = AgoraEvents.CouncilVersionPublished['version'];
