import { createZodDto, zGetInstallationPath } from '@proxenos/core';

export class InstallationParams extends createZodDto(zGetInstallationPath) {}
