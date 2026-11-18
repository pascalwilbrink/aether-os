import { createZodDto, zRequestChangesRequest } from '@hephaestus/core';

export class RequestChangesRequest extends createZodDto(
  zRequestChangesRequest,
) {}
