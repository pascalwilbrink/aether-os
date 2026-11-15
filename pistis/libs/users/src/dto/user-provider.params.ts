import { createZodDto, zUnlinkUserProviderPath } from '@pistis/core';

/** `:userId` and `:userProviderId` (UUIDs). */
export class UserProviderParams extends createZodDto(zUnlinkUserProviderPath) {}
