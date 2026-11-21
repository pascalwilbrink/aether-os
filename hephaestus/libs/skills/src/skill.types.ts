import type { AgentVersion, AgoraEvents } from '@hephaestus/core';

/** A skill version as Agora published it (`skill-version.published`). */
export type PublishedSkillVersion =
  AgoraEvents.SkillVersionPublished['version'];

/** One file of a skill's folder: its path and text. */
export type SkillFile = PublishedSkillVersion['files'][number];

/** An agent version's pinned skill: `{ name, version, enabled }`. */
export type PinnedSkill = AgentVersion['skills'][number];
