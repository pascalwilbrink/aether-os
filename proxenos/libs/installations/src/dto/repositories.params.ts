import { createZodDto, zListRepositoriesPath } from '@proxenos/core';

export class RepositoriesParams extends createZodDto(zListRepositoriesPath) {}
