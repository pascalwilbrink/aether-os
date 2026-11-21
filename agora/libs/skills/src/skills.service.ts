import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import {
  AccessControl,
  AgoraEvents,
  findPage,
  isUniqueViolation,
  mapPage,
  Transactional,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@agora/core';
import { TenancyService } from '@agora/tenancy';

import { checkSkillFiles, type CheckedSkill } from './skill-files.js';
import { SkillVersionEntity } from './skill-version.entity.js';
import { SkillEntity } from './skill.entity.js';
import {
  SkillAlreadyExistsError,
  SkillArchivedError,
  SkillInvalidError,
} from './skill.errors.js';
import { SkillMapper } from './skill.mapper.js';

/**
 * An organization's skills (the Agent Skills format) and their versions,
 * which never change; agent versions pin one (`skills[]`). Writes need an
 * organization Polis says is active; reads only the token's organization
 * (Krepis). An archived skill gets no new versions and can't be chosen
 * again, but versions that pinned it keep running.
 *
 * Every change publishes an event in its transaction, the skill its
 * aggregate and its `revision` the `aggregateVersion`: `skill.created`
 * then `skill-version.published` (with the files) for a new skill,
 * `skill-version.published` for each next version, `skill.archived`.
 * Hephaestus keeps its copy of skills and versions from them.
 */
@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(SkillEntity)
    private readonly skills: Repository<SkillEntity>,
    @InjectRepository(SkillVersionEntity)
    private readonly versions: Repository<SkillVersionEntity>,
    private readonly mapper: SkillMapper,
    private readonly tenancy: TenancyService,
    private readonly access: AccessControl,
    private readonly events: AgoraEvents,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: ApiTypes.CreateSkillRequest,
  ): Promise<ApiTypes.SkillResponse> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const checked = this.check(dto.files, dto.name);
    if (
      await this.skills.exists({ where: { organizationId, name: dto.name } })
    ) {
      throw new SkillAlreadyExistsError(dto.name);
    }
    const now = new Date();
    const by = this.access.principal().sub;
    const skill = this.mapper.toEntity(organizationId, checked, by, now);
    try {
      await this.skills.insert(skill);
    } catch (error) {
      if (isUniqueViolation(error)) throw new SkillAlreadyExistsError(dto.name);
      throw error;
    }
    await this.events.emit({
      eventType: 'skill.created',
      aggregateId: skill.id,
      aggregateVersion: skill.revision,
      organizationId,
      payload: {
        skillId: skill.id,
        name: skill.name,
        createdBy: skill.createdBy,
        createdAt: skill.createdAt.toISOString(),
      },
    });
    const version = this.mapper.toVersionEntity(
      skill,
      1,
      dto.files,
      checked,
      by,
      now,
    );
    await this.insertVersion(version);
    skill.revision += 1;
    await this.skills.update(skill.id, { revision: skill.revision });
    await this.emitVersion(skill, version);
    return this.mapper.toResponse(skill);
  }

  async list(
    organizationId: string,
    query: PageRequest & { status?: ApiTypes.SkillStatus },
  ): Promise<Page<ApiTypes.SkillResponse>> {
    const entities = await findPage(
      this.skills,
      {
        where: {
          organizationId,
          ...(query.status ? { status: query.status } : {}),
        },
        sortBy: 'name',
        direction: 'ASC',
      },
      query,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async get(
    organizationId: string,
    skillId: string,
  ): Promise<ApiTypes.SkillResponse> {
    return this.mapper.toResponse(await this.load(organizationId, skillId));
  }

  /** Idempotent: archiving an archived skill publishes nothing. */
  @Transactional()
  async archive(
    organizationId: string,
    skillId: string,
  ): Promise<ApiTypes.SkillResponse> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const skill = await this.load(organizationId, skillId, true);
    if (skill.status !== 'archived') {
      skill.status = 'archived';
      skill.updatedAt = new Date();
      skill.revision += 1;
      await this.skills.save(skill);
      await this.events.emit({
        eventType: 'skill.archived',
        aggregateId: skill.id,
        aggregateVersion: skill.revision,
        organizationId,
        payload: { skillId: skill.id },
      });
    }
    return this.mapper.toResponse(skill);
  }

  /** The next version; the skill row is locked, so numbers have no gaps. */
  @Transactional()
  async createVersion(
    organizationId: string,
    skillId: string,
    dto: ApiTypes.CreateSkillVersionRequest,
  ): Promise<ApiTypes.SkillVersionResponse> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const skill = await this.load(organizationId, skillId, true);
    if (skill.status === 'archived') {
      throw new SkillArchivedError(skill.name);
    }
    const checked = this.check(dto.files, skill.name);
    const now = new Date();
    const version = this.mapper.toVersionEntity(
      skill,
      skill.latestVersion + 1,
      dto.files,
      checked,
      this.access.principal().sub,
      now,
    );
    await this.insertVersion(version);
    skill.latestVersion = version.version;
    skill.description = checked.description;
    skill.updatedAt = now;
    skill.revision += 1;
    await this.skills.save(skill);
    await this.emitVersion(skill, version);
    return this.mapper.toVersionResponse(version, true);
  }

  async listVersions(
    organizationId: string,
    skillId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.SkillVersionResponse>> {
    await this.load(organizationId, skillId);
    const entities = await findPage(
      this.versions,
      { where: { skillId }, sortBy: 'version', direction: 'DESC' },
      page,
    );
    return mapPage(entities, (entity) =>
      this.mapper.toVersionResponse(entity, false),
    );
  }

  async getVersion(
    organizationId: string,
    skillId: string,
    version: number,
  ): Promise<ApiTypes.SkillVersionResponse> {
    await this.load(organizationId, skillId);
    const entity = await this.withFiles({ skillId, version });
    if (!entity) {
      throw new NotFoundException(
        `Version ${version} of skill ${skillId} not found.`,
      );
    }
    return this.mapper.toVersionResponse(entity, true);
  }

  /**
   * For a new agent version: each skill at most once, and every enabled one
   * an active skill of the organization with that version
   * (`SKILL_INVALID`).
   */
  async assertChoosable(
    organizationId: string,
    configured: readonly ApiTypes.AgentSkillConfiguration[],
  ): Promise<void> {
    const names = configured.map((skill) => skill.name);
    const repeated = names.find((name, i) => names.indexOf(name) !== i);
    if (repeated) {
      throw new SkillInvalidError(
        `Skill ${repeated} is listed more than once in skills.`,
      );
    }
    const enabled = configured.filter((skill) => skill.enabled);
    if (enabled.length === 0) return;
    const found = await this.skills.find({
      where: { organizationId, name: In(enabled.map((skill) => skill.name)) },
    });
    const byName = new Map(found.map((skill) => [skill.name, skill]));
    for (const chosen of enabled) {
      const skill = byName.get(chosen.name);
      if (!skill) {
        throw new SkillInvalidError(
          `The organization has no skill named ${chosen.name}.`,
        );
      }
      if (skill.status === 'archived') {
        throw new SkillInvalidError(
          `Skill ${chosen.name} is archived: choose another one.`,
        );
      }
      const version = versionNumber(chosen.version);
      if (version === null || version > skill.latestVersion) {
        throw new SkillInvalidError(
          `Skill ${chosen.name} has no version ${chosen.version} (its latest is ${skill.latestVersion}).`,
        );
      }
    }
  }

  private emitVersion(
    skill: SkillEntity,
    version: SkillVersionEntity,
  ): Promise<unknown> {
    return this.events.emit({
      eventType: 'skill-version.published',
      aggregateId: skill.id,
      aggregateVersion: skill.revision,
      organizationId: skill.organizationId,
      payload: {
        skillId: skill.id,
        skillVersionId: version.id,
        version: this.mapper.toVersionEvent(version),
      },
    });
  }

  private check(files: ApiTypes.SkillFile[], name: string): CheckedSkill {
    const checked = checkSkillFiles(files, name);
    if ('problem' in checked) {
      throw new SkillInvalidError(checked.problem);
    }
    return checked;
  }

  private async insertVersion(entity: SkillVersionEntity): Promise<void> {
    // TypeORM's insert types don't take jsonb columns typed as interfaces.
    await this.versions.insert(
      entity as Parameters<Repository<SkillVersionEntity>['insert']>[0],
    );
  }

  private withFiles(
    where: Partial<Pick<SkillVersionEntity, 'skillId' | 'version'>>,
  ): Promise<SkillVersionEntity | null> {
    return this.versions
      .createQueryBuilder('version')
      .addSelect('version.files')
      .where(where)
      .getOne();
  }

  private async load(
    organizationId: string,
    skillId: string,
    lock = false,
  ): Promise<SkillEntity> {
    const entity = await this.skills.findOne({
      where: { organizationId, id: skillId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Skill ${skillId} not found.`);
    }
    return entity;
  }
}

/** `"3"` → 3; anything else isn't a version number. */
function versionNumber(value: string): number | null {
  return /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null;
}
