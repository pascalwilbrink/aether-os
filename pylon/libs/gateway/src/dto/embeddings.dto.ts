import {
  createZodDto,
  zCreateEmbeddingsPath,
  zEmbeddingsRequest,
  zEmbeddingsResponse,
} from '@pylon/core';

/** `:organizationId` and `:projectId`. */
export class EmbeddingsParams extends createZodDto(zCreateEmbeddingsPath) {}

export class EmbeddingsRequest extends createZodDto(zEmbeddingsRequest) {}

export class EmbeddingsResponse extends createZodDto(zEmbeddingsResponse) {}
