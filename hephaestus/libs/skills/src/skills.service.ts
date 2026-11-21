import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  OnDomainEvent,
  Transactional,
  type AgoraEvents,
  type DomainEvent,
} from '@hephaestus/core';

import { SkillVersionEntity } from './skill-version.entity.js';
import { SkillEntity } from './skill.entity.js';
import {
  SkillNotCopiedYetError,
  SkillUnavailableError,
} from './skill.errors.js';
import { SkillMapper } from './skill.mapper.js';
import type { PinnedSkill, SkillFile } from './skill.types.js';

/** A skill version a run uses: its name, version and files. */
export interface SkillForRun {
  name: string;
  version: number;
  description: string;
  files: SkillFile[];
}

/**
 * Hephaestus's copy of Agora's skills and their versions
 * (../../../../docs/skills.md), kept from `agora.events`, for runs to read
 * the versions agent versions pin. Agora owns them: Hephaestus serves no
 * skills API and checks no agent version's skills.
 *
 * Each skill records the last event applied (`revision`, the events'
 * `aggregateVersion`): an event that isn't newer changes nothing about the
 * skill, though a late `skill-version.published` still stores its version
 * (versions never change). An event about a skill the copy doesn't have yet
 * throws `SkillNotCopiedYetError`, so the consumer retries it after
 * `skill.created`.
 */
@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(SkillEntity)
    private readonly skills: Repository<SkillEntity>,
    @InjectRepository(SkillVersionEntity)
    private readonly versions: Repository<SkillVersionEntity>,
    private readonly mapper: SkillMapper,
  ) {}

  @OnDomainEvent('agora.skill.created')
  @Transactional()
  async onCreated(event: DomainEvent<AgoraEvents.SkillCreated>): Promise<void> {
    await this.skills
      .createQueryBuilder()
      .insert()
      .values(
        this.mapper.fromCreated(
          event.payload,
          organizationOf(event),
          event.aggregateVersion,
        ),
      )
      .orIgnore()
      .execute();
  }

  /**
   * Stores the version (whole, files included) and, when it's newer than
   * what the copy has, makes it the skill's latest.
   */
  @OnDomainEvent('agora.skill-version.published')
  @Transactional()
  async onVersionPublished(
    event: DomainEvent<AgoraEvents.SkillVersionPublished>,
  ): Promise<void> {
    const skill = await this.lockForEvent(event);
    await this.versions
      .createQueryBuilder()
      .insert()
      // TypeORM's insert types don't take jsonb columns typed as interfaces.
      .values(
        this.mapper.fromPublished(event.payload.version) as Parameters<
          Repository<SkillVersionEntity>['insert']
        >[0],
      )
      .orIgnore()
      .execute();
    if (skill) {
      const { version, description } = event.payload.version;
      if (version >= skill.latestVersion) {
        skill.latestVersion = version;
        skill.description = description;
      }
      await this.save(skill, event);
    }
  }

  @OnDomainEvent('agora.skill.archived')
  @Transactional()
  async onArchived(
    event: DomainEvent<AgoraEvents.SkillArchived>,
  ): Promise<void> {
    const skill = await this.lockForEvent(event);
    if (skill) {
      skill.status = 'archived';
      await this.save(skill, event);
    }
  }

  /**
   * The pinned versions an agent version's enabled skills name, with their
   * files, for a run; archived skills too (the version pinned them).
   */
  async forRun(
    organizationId: string,
    configured: readonly PinnedSkill[],
  ): Promise<SkillForRun[]> {
    const result: SkillForRun[] = [];
    for (const chosen of configured.filter((skill) => skill.enabled)) {
      const version = versionNumber(chosen.version);
      const entity =
        version === null
          ? null
          : await this.versions
              .createQueryBuilder('version')
              .addSelect('version.files')
              .where({ organizationId, name: chosen.name, version })
              .getOne();
      if (!entity?.files) {
        throw new SkillUnavailableError(
          `The organization has no version ${chosen.version} of skill ${chosen.name}`,
        );
      }
      result.push({
        name: entity.name,
        version: entity.version,
        description: entity.description,
        files: entity.files,
      });
    }
    return result;
  }

  /**
   * The skill, locked, if the event is newer than the copy; null when it
   * isn't (applied already, or older).
   */
  private async lockForEvent(
    event: DomainEvent<{ skillId: string }>,
  ): Promise<SkillEntity | null> {
    const skill = await this.skills.findOne({
      where: {
        id: event.payload.skillId,
        organizationId: organizationOf(event),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!skill) {
      throw new SkillNotCopiedYetError(event.payload.skillId);
    }
    return event.aggregateVersion > skill.revision ? skill : null;
  }

  private async save(
    skill: SkillEntity,
    event: DomainEvent<unknown>,
  ): Promise<void> {
    skill.revision = event.aggregateVersion;
    skill.updatedAt = new Date(event.occurredAt);
    await this.skills.save(skill);
  }
}

function organizationOf(event: DomainEvent<unknown>): string {
  if (!event.organizationId) {
    throw new Error(`Event ${event.eventId} has no organization`);
  }
  return event.organizationId;
}

/** `"3"` → 3; anything else isn't a version number. */
function versionNumber(value: string): number | null {
  return /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null;
}
