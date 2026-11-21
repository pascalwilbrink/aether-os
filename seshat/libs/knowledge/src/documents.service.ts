import { Inject, Injectable } from '@nestjs/common';

import type { ApiTypes } from '@seshat/core';

import { DocumentFiles } from './document-files.js';
import { KnowledgeItemsService } from './knowledge-items.service.js';
import {
  KnowledgeDocumentInvalidError,
  KnowledgeItemReadOnlyError,
} from './knowledge.errors.js';
import {
  KNOWLEDGE_OPTIONS,
  type KnowledgeOptions,
} from './knowledge.options.js';

/**
 * Documents: files of the project in Loculus, registered as `document`
 * items and indexed in the background (`DocumentIndexer`). The file must
 * be the project's, uploaded (`available`) and not larger than Seshat reads.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly items: KnowledgeItemsService,
    private readonly files: DocumentFiles,
    @Inject(KNOWLEDGE_OPTIONS) private readonly options: KnowledgeOptions,
  ) {}

  async create(
    organizationId: string,
    projectId: string,
    dto: ApiTypes.CreateKnowledgeDocumentRequest,
  ): Promise<ApiTypes.KnowledgeItemResponse> {
    const file = await this.file(organizationId, projectId, dto.fileId);
    return this.items.createDocument(organizationId, projectId, file, dto);
  }

  async update(
    organizationId: string,
    projectId: string,
    itemId: string,
    dto: ApiTypes.UpdateKnowledgeDocumentRequest,
  ): Promise<ApiTypes.KnowledgeItemResponse> {
    // A repository document changes with a commit: refused before Loculus is asked.
    const item = await this.items.findById(organizationId, projectId, itemId);
    if (item.source.kind === 'repository') {
      throw new KnowledgeItemReadOnlyError(
        itemId,
        item.source.repository?.fullName ?? null,
      );
    }
    const file = await this.file(organizationId, projectId, dto.fileId);
    return this.items.updateDocument(
      organizationId,
      projectId,
      itemId,
      file,
      dto,
    );
  }

  private async file(
    organizationId: string,
    projectId: string,
    fileId: string,
  ) {
    const file = await this.files.describe(organizationId, projectId, fileId);
    if (!file) {
      throw new KnowledgeDocumentInvalidError(
        `The project has no file ${fileId} in Loculus.`,
      );
    }
    if (file.status !== 'available') {
      throw new KnowledgeDocumentInvalidError(
        `File ${fileId} isn't uploaded yet: complete its upload first.`,
      );
    }
    if (file.sizeBytes > this.options.documentMaxBytes) {
      throw new KnowledgeDocumentInvalidError(
        `File ${fileId} is larger than ${this.options.documentMaxBytes} bytes, the most Seshat reads.`,
      );
    }
    return file;
  }
}
