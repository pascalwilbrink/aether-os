import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import {
  findPage,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@episteme/core';

import { KnowledgeAuditEntity, type Actor } from './entities/index.js';

export interface AuditRecord {
  organizationId: string;
  resourceId: string;
  versionId?: string | null;
  action: ApiTypes.KnowledgeAuditAction;
  actor: Actor | null;
  reason?: string | null;
  changes?: KnowledgeAuditEntity['changes'];
  at: Date;
}

/** The governance audit (episteme/CLAUDE.md, Governance audit), written in the change's transaction. */
@Injectable()
export class KnowledgeAudit {
  constructor(
    @InjectRepository(KnowledgeAuditEntity)
    private readonly entries: Repository<KnowledgeAuditEntity>,
  ) {}

  async record(record: AuditRecord): Promise<void> {
    await this.entries.insert({
      id: uuidv7(),
      organizationId: record.organizationId,
      resourceId: record.resourceId,
      versionId: record.versionId ?? null,
      action: record.action,
      actor: record.actor,
      reason: record.reason ?? null,
      changes: record.changes ?? {},
      occurredAt: record.at,
    });
  }

  page(
    organizationId: string,
    resourceId: string,
    page: PageRequest,
  ): Promise<Page<KnowledgeAuditEntity>> {
    return findPage(
      this.entries,
      {
        where: { organizationId, resourceId },
        sortBy: 'occurredAt',
        direction: 'ASC',
      },
      page,
    );
  }
}
