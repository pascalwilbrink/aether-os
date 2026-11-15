import { createZodDto, zLinkUserProviderRequest } from '@pistis/core';

export class LinkUserProviderRequest extends createZodDto(
  zLinkUserProviderRequest,
) {}
