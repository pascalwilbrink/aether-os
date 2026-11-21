import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { AgentsService } from '@hephaestus/agents';
import {
  AccessControl,
  findPage,
  mapPage,
  Transactional,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@hephaestus/core';
import { OrganizationsService, ProjectsService } from '@hephaestus/tenancy';

import {
  effectiveTemplate,
  TemplateProblem,
  type EffectiveTemplate,
  type TemplateContent,
} from './template-content.js';
import { TaskTemplateVersionEntity } from './task-template-version.entity.js';
import { TaskTemplateEntity } from './task-template.entity.js';
import {
  TaskTemplateArchivedError,
  TaskTemplateInvalidError,
} from './task-template.errors.js';
import {
  ORGANIZATION_SCOPE,
  TaskTemplateMapper,
} from './task-template.mapper.js';

/** A template version resolved for a new task. */
export interface ResolvedTemplate {
  templateId: string;
  version: number;
  effective: EffectiveTemplate;
}

/**
 * Task templates (docs/tasks.md, Task templates): organization-wide or a
 * project's, edited by adding immutable versions. Who may do what:
 * organization-wide ones are read with `org:read` and managed with
 * `org:task-template:manage`; a project's with `task:read` and
 * `task-template:manage` in it. A project template may `extend` an
 * organization template version, adding to it, never weakening it.
 */
@Injectable()
export class TaskTemplatesService {
  constructor(
    @InjectRepository(TaskTemplateEntity)
    private readonly templates: Repository<TaskTemplateEntity>,
    @InjectRepository(TaskTemplateVersionEntity)
    private readonly versions: Repository<TaskTemplateVersionEntity>,
    private readonly mapper: TaskTemplateMapper,
    private readonly agents: AgentsService,
    private readonly organizations: OrganizationsService,
    private readonly projects: ProjectsService,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    request: ApiTypes.CreateTaskTemplateRequest,
  ): Promise<ApiTypes.TaskTemplateResponse> {
    await this.assertMayManage(organizationId, request.projectId ?? null);
    const {
      name: _name,
      description: _description,
      projectId: _projectId,
      ...content
    } = request;
    const now = new Date();
    const createdBy = this.access.principal().sub;
    const template = this.mapper.toEntity(
      organizationId,
      request,
      createdBy,
      now,
    );
    await this.effectiveOf(template, content);
    await this.templates.insert(template);
    await this.versions.insert(
      this.mapper.toVersionEntity(
        template,
        1,
        content,
        createdBy,
        now,
      ) as Parameters<Repository<TaskTemplateVersionEntity>['insert']>[0],
    );
    return this.mapper.toResponse(template);
  }

  /** A new version: the template as edited (earlier versions never change). */
  @Transactional()
  async createVersion(
    organizationId: string,
    templateId: string,
    content: TemplateContent,
  ): Promise<ApiTypes.TaskTemplateVersionResponse> {
    const template = await this.load(organizationId, templateId, true);
    await this.assertMayManage(organizationId, template.projectId);
    const effective = await this.effectiveOf(template, content);
    const now = new Date();
    template.latestVersion += 1;
    template.updatedAt = now;
    await this.templates.save(template);
    const version = this.mapper.toVersionEntity(
      template,
      template.latestVersion,
      content,
      this.access.principal().sub,
      now,
    );
    await this.versions.insert(
      version as Parameters<Repository<TaskTemplateVersionEntity>['insert']>[0],
    );
    return this.mapper.toVersionResponse(version, effective);
  }

  /** Idempotent; existing tasks and extending templates keep their pins. */
  @Transactional()
  async archive(
    organizationId: string,
    templateId: string,
  ): Promise<ApiTypes.TaskTemplateResponse> {
    const template = await this.load(organizationId, templateId, true);
    await this.assertMayManage(organizationId, template.projectId);
    if (template.status !== 'archived') {
      template.status = 'archived';
      template.updatedAt = new Date();
      await this.templates.save(template);
    }
    return this.mapper.toResponse(template);
  }

  /**
   * Organization-wide templates; with `projectId`, what that project sees
   * (its own and the organization's).
   */
  async list(
    organizationId: string,
    projectId: string | undefined,
    page: PageRequest,
  ): Promise<Page<ApiTypes.TaskTemplateResponse>> {
    await this.organizations.assertExists(organizationId);
    if (projectId) {
      this.access.assertProjectPermission(projectId, 'task:read');
    }
    const entities = await findPage(
      this.templates,
      {
        where: {
          organizationId,
          scope: projectId
            ? [projectId, ORGANIZATION_SCOPE]
            : ORGANIZATION_SCOPE,
        },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    templateId: string,
  ): Promise<ApiTypes.TaskTemplateResponse> {
    return this.mapper.toResponse(
      await this.loadReadable(organizationId, templateId),
    );
  }

  async listVersions(
    organizationId: string,
    templateId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.TaskTemplateVersionResponse>> {
    const template = await this.loadReadable(organizationId, templateId);
    const entities = await findPage(
      this.versions,
      { where: { templateId }, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );
    const items = [];
    for (const entity of entities.items) {
      items.push(
        this.mapper.toVersionResponse(
          entity,
          await this.effectiveOf(template, entity.content),
        ),
      );
    }
    return { items, nextCursor: entities.nextCursor };
  }

  async findVersion(
    organizationId: string,
    templateId: string,
    version: number,
  ): Promise<ApiTypes.TaskTemplateVersionResponse> {
    const template = await this.loadReadable(organizationId, templateId);
    const entity = await this.loadVersion(templateId, version);
    return this.mapper.toVersionResponse(
      entity,
      await this.effectiveOf(template, entity.content),
    );
  }

  /**
   * The version a new task in `projectId` comes from: the template must be
   * visible there (another project's is a 404) and active.
   */
  async resolve(
    organizationId: string,
    projectId: string,
    templateId: string,
    version?: number,
  ): Promise<ResolvedTemplate> {
    const template = await this.load(organizationId, templateId);
    if (template.projectId && template.projectId !== projectId) {
      throw this.notFound(templateId);
    }
    if (template.status === 'archived') {
      throw new TaskTemplateArchivedError(template.id);
    }
    const entity = await this.loadVersion(
      templateId,
      version ?? template.latestVersion,
    );
    return {
      templateId,
      version: entity.version,
      effective: await this.effectiveOf(template, entity.content),
    };
  }

  /**
   * The effective content of `content` for `template`, checking what it
   * refers to: its agent, and what it extends (only a project template can,
   * and only an organization-wide template version of the same
   * organization).
   */
  private async effectiveOf(
    template: TaskTemplateEntity,
    content: TemplateContent,
  ): Promise<EffectiveTemplate> {
    if (!template.projectId && (content.context?.length ?? 0) > 0) {
      // Knowledge belongs to one project: pinned elsewhere, it'd be refused.
      throw new TaskTemplateInvalidError(
        "Knowledge belongs to a project: only a project's template pins it (an organization-wide template can't)",
      );
    }
    let base: EffectiveTemplate | undefined;
    if (content.extends) {
      if (!template.projectId) {
        throw new TaskTemplateInvalidError(
          'Only a project template can extend another (an organization-wide one)',
        );
      }
      const parent = await this.templates.findOneBy({
        id: content.extends.templateId,
        organizationId: template.organizationId,
      });
      if (!parent || parent.projectId) {
        throw new TaskTemplateInvalidError(
          `${content.extends.templateId} is not an organization-wide template of this organization`,
        );
      }
      const parentVersion = await this.versions.findOneBy({
        templateId: parent.id,
        version: content.extends.version,
      });
      if (!parentVersion) {
        throw new TaskTemplateInvalidError(
          `Template ${parent.id} has no version ${content.extends.version}`,
        );
      }
      base = await this.effectiveOf(parent, parentVersion.content);
    }
    let effective: EffectiveTemplate;
    try {
      effective = effectiveTemplate(content, base);
    } catch (error) {
      if (error instanceof TemplateProblem) {
        throw new TaskTemplateInvalidError(error.message);
      }
      throw error;
    }
    if (content.agentId) {
      await this.agents.assertExists(template.organizationId, content.agentId);
    }
    return effective;
  }

  private async assertMayManage(
    organizationId: string,
    projectId: string | null,
  ): Promise<void> {
    if (projectId) {
      await this.projects.assertAcceptsWrites(organizationId, projectId);
      this.access.assertProjectPermission(projectId, 'task-template:manage');
      return;
    }
    await this.organizations.assertAcceptsWrites(organizationId);
    if (!this.access.hasOrganizationPermission('org:task-template:manage')) {
      throw new ForbiddenException(
        'Managing organization-wide templates needs org:task-template:manage',
      );
    }
  }

  /** Organization-wide: any member; a project's: `task:read` there. */
  private async loadReadable(
    organizationId: string,
    templateId: string,
  ): Promise<TaskTemplateEntity> {
    await this.organizations.assertExists(organizationId);
    const template = await this.load(organizationId, templateId);
    if (template.projectId) {
      this.access.assertProjectPermission(template.projectId, 'task:read');
    }
    return template;
  }

  private async load(
    organizationId: string,
    templateId: string,
    forUpdate = false,
  ): Promise<TaskTemplateEntity> {
    const template = await this.templates.findOne({
      where: { id: templateId, organizationId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!template) {
      throw this.notFound(templateId);
    }
    return template;
  }

  private async loadVersion(
    templateId: string,
    version: number,
  ): Promise<TaskTemplateVersionEntity> {
    const entity = await this.versions.findOneBy({ templateId, version });
    if (!entity) {
      throw new NotFoundException(
        `Task template ${templateId} has no version ${version}`,
      );
    }
    return entity;
  }

  private notFound(templateId: string): NotFoundException {
    return new NotFoundException(`Task template ${templateId} not found`);
  }
}
