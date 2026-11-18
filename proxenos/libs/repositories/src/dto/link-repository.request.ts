import { createZodDto, zLinkRepositoryRequest } from '@proxenos/core';

export class LinkRepositoryRequest extends createZodDto(
  zLinkRepositoryRequest,
) {}
