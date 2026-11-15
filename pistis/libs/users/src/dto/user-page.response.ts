import { createZodDto, zUserPage } from '@pistis/core';

/** Newest first. */
export class UserPage extends createZodDto(zUserPage) {}
