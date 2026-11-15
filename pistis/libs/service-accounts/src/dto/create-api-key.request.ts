import { createZodDto, zCreateApiKeyRequest } from '@pistis/core';

export class CreateApiKeyRequest extends createZodDto(zCreateApiKeyRequest) {}
