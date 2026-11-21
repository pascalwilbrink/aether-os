import {
  createZodDto,
  zCreateKnowledgeDocumentRequest,
  zCreateKnowledgeItemRequest,
  zGetKnowledgeItemPath,
  zKnowledgeItemPage,
  zKnowledgeItemResponse,
  zKnowledgeItemVersionPage,
  zKnowledgePassagePage,
  zKnowledgeSearchResponse,
  zListKnowledgeItemsPath,
  zListKnowledgeItemsQuery,
  zListKnowledgeItemVersionsQuery,
  zListKnowledgeItemPassagesQuery,
  zSearchKnowledgeRequest,
  zUpdateKnowledgeDocumentRequest,
  zUpdateKnowledgeItemRequest,
} from '@seshat/core';

/** `:organizationId` and `:projectId` (UUIDs). */
export class ProjectParams extends createZodDto(zListKnowledgeItemsPath) {}
/** `:organizationId`, `:projectId` and `:itemId` (UUIDs). */
export class ItemParams extends createZodDto(zGetKnowledgeItemPath) {}

export class CreateKnowledgeItemRequest extends createZodDto(
  zCreateKnowledgeItemRequest,
) {}
export class UpdateKnowledgeItemRequest extends createZodDto(
  zUpdateKnowledgeItemRequest,
) {}
export class CreateKnowledgeDocumentRequest extends createZodDto(
  zCreateKnowledgeDocumentRequest,
) {}
export class UpdateKnowledgeDocumentRequest extends createZodDto(
  zUpdateKnowledgeDocumentRequest,
) {}
export class SearchKnowledgeRequest extends createZodDto(
  zSearchKnowledgeRequest,
) {}
export class ListKnowledgeItemsQuery extends createZodDto(
  zListKnowledgeItemsQuery,
) {}
export class ListKnowledgeItemVersionsQuery extends createZodDto(
  zListKnowledgeItemVersionsQuery,
) {}

export class KnowledgeItemResponse extends createZodDto(
  zKnowledgeItemResponse,
) {}
export class KnowledgeItemPage extends createZodDto(zKnowledgeItemPage) {}
export class KnowledgeItemVersionPage extends createZodDto(
  zKnowledgeItemVersionPage,
) {}
export class KnowledgeSearchResponse extends createZodDto(
  zKnowledgeSearchResponse,
) {}

export class ListKnowledgeItemPassagesQuery extends createZodDto(
  zListKnowledgeItemPassagesQuery,
) {}

export class KnowledgePassagePage extends createZodDto(zKnowledgePassagePage) {}
