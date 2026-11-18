import { createZodDto, zListInstallationsPath } from '@proxenos/core';

export class InstallationsParams extends createZodDto(zListInstallationsPath) {}
