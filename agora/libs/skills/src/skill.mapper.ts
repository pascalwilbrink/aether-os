import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes, SkillVersionPublished } from '@agora/core';

import type { CheckedSkill } from './skill-files.js';
import { SkillVersionEntity } from './skill-version.entity.js';
import { SkillEntity } from './skill.entity.js';

@Injectable()
export class SkillMapper {
  /** A new skill, at version 1; its ID (UUIDv7) is generated here. */
  toEntity(
    organizationId: string,
    checked: CheckedSkill,
    createdBy: string,
    now: Date,
  ): SkillEntity {
    return Object.assign(new SkillEntity(), {
      id: uuidv7(),
      organizationId,
      name: checked.name,
      description: checked.description,
      status: 'active',
      latestVersion: 1,
      revision: 1,
      createdBy,
      createdAt: now,
      updatedAt: now,
    } satisfies SkillEntity);
  }

  toVersionEntity(
    skill: SkillEntity,
    version: number,
    files: ApiTypes.SkillFile[],
    checked: CheckedSkill,
    createdBy: string,
    now: Date,
  ): SkillVersionEntity {
    return Object.assign(new SkillVersionEntity(), {
      id: uuidv7(),
      skillId: skill.id,
      organizationId: skill.organizationId,
      name: skill.name,
      version,
      description: checked.description,
      files: sortFiles(files),
      fileCount: files.length,
      sizeBytes: checked.sizeBytes,
      createdBy,
      createdAt: now,
    } satisfies SkillVersionEntity);
  }

  toResponse(entity: SkillEntity): ApiTypes.SkillResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      latestVersion: entity.latestVersion,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  /** A version as `skill-version.published` carries it: the whole of it. */
  toVersionEvent(entity: SkillVersionEntity): SkillVersionPublished['version'] {
    return {
      id: entity.id,
      skillId: entity.skillId,
      organizationId: entity.organizationId,
      name: entity.name,
      version: entity.version,
      description: entity.description,
      files: entity.files ?? [],
      fileCount: entity.fileCount,
      sizeBytes: entity.sizeBytes,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  /** With its files only when reading one version. */
  toVersionResponse(
    entity: SkillVersionEntity,
    withFiles: boolean,
  ): ApiTypes.SkillVersionResponse {
    return {
      id: entity.id,
      skillId: entity.skillId,
      organizationId: entity.organizationId,
      name: entity.name,
      version: entity.version,
      description: entity.description,
      sizeBytes: entity.sizeBytes,
      fileCount: entity.fileCount,
      ...(withFiles && entity.files ? { files: entity.files } : {}),
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}

/** `SKILL.md` first, then by path. */
function sortFiles(files: ApiTypes.SkillFile[]): ApiTypes.SkillFile[] {
  const rank = (file: ApiTypes.SkillFile) => (file.path === 'SKILL.md' ? 0 : 1);
  return [...files].sort(
    (a, b) =>
      rank(a) - rank(b) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
}
