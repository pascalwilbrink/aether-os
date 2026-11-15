import { createZodDto, zGetUserPath } from '@pistis/core';

/** `:userId` (a UUID). */
export class UserParams extends createZodDto(zGetUserPath) {}
