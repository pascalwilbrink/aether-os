import {
  createZodDto,
  zListOllamaModelsPath,
  zOllamaModelList,
} from '@pylon/core';

export class OllamaModelList extends createZodDto(zOllamaModelList) {}

/** `:organizationId`. */
export class OllamaModelsParams extends createZodDto(zListOllamaModelsPath) {}
