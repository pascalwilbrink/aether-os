import {
  createZodDto,
  zListOllamaModelsPath,
  zOllamaModelList,
} from '@hephaestus/core';

export class OllamaModelList extends createZodDto(zOllamaModelList) {}

/** `:organizationId`. */
export class OllamaModelsParams extends createZodDto(zListOllamaModelsPath) {}
