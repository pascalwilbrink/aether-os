import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@hephaestus/core';

import type { EffectiveTemplate, TemplateContent } from './template-content.js';
import { TaskTemplateVersionEntity } from './task-template-version.entity.js';
import { TaskTemplateEntity } from './task-template.entity.js';

/** The `scope` of an organization-wide template. */
export const ORGANIZATION_SCOPE = 'organization';

@Injectable()
export class TaskTemplateMapper {
  toEntity(
    organizationId: string,
    request: ApiTypes.CreateTaskTemplateRequest,
    createdBy: string,
    now: Date,
  ): TaskTemplateEntity {
    return Object.assign(new TaskTemplateEntity(), {
      id: uuidv7(),
      organizationId,
      projectId: request.projectId ?? null,
      scope: request.projectId ?? ORGANIZATION_SCOPE,
      name: request.name,
      description: request.description ?? '',
      status: 'active',
      latestVersion: 1,
      createdBy,
      createdAt: now,
      updatedAt: now,
    } satisfies TaskTemplateEntity);
  }

  toVersionEntity(
    template: TaskTemplateEntity,
    version: number,
    content: TemplateContent,
    createdBy: string,
    now: Date,
  ): TaskTemplateVersionEntity {
    return Object.assign(new TaskTemplateVersionEntity(), {
      id: uuidv7(),
      templateId: template.id,
      organizationId: template.organizationId,
      version,
      content,
      createdBy,
      createdAt: now,
    } satisfies TaskTemplateVersionEntity);
  }

  toResponse(entity: TaskTemplateEntity): ApiTypes.TaskTemplateResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      latestVersion: entity.latestVersion,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  toVersionResponse(
    entity: TaskTemplateVersionEntity,
    effective: EffectiveTemplate,
  ): ApiTypes.TaskTemplateVersionResponse {
    return {
      templateId: entity.templateId,
      version: entity.version,
      content: entity.content,
      effective,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
