import { Injectable } from '@nestjs/common';

import type { AgoraEvents } from '@hephaestus/core';

import { SkillVersionEntity } from './skill-version.entity.js';
import { SkillEntity } from './skill.entity.js';
import type { PublishedSkillVersion } from './skill.types.js';

/** Agora's skill events → Hephaestus's copy (IDs are Agora's). */
@Injectable()
export class SkillMapper {
  /** A new skill, without a version until `skill-version.published` comes. */
  fromCreated(
    payload: AgoraEvents.SkillCreated,
    organizationId: string,
    revision: number,
  ): SkillEntity {
    const createdAt = new Date(payload.createdAt);
    return Object.assign(new SkillEntity(), {
      id: payload.skillId,
      organizationId,
      name: payload.name,
      description: '',
      status: 'active',
      latestVersion: 0,
      revision,
      createdBy: payload.createdBy,
      createdAt,
      updatedAt: createdAt,
    } satisfies SkillEntity);
  }

  fromPublished(version: PublishedSkillVersion): SkillVersionEntity {
    return Object.assign(new SkillVersionEntity(), {
      id: version.id,
      skillId: version.skillId,
      organizationId: version.organizationId,
      name: version.name,
      version: version.version,
      description: version.description,
      files: version.files,
      fileCount: version.fileCount,
      sizeBytes: version.sizeBytes,
      createdBy: version.createdBy,
      createdAt: new Date(version.createdAt),
    } satisfies SkillVersionEntity);
  }
}
