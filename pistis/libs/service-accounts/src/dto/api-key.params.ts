import { createZodDto, zRevokeApiKeyPath } from '@pistis/core';

export class ApiKeyParams extends createZodDto(zRevokeApiKeyPath) {}
