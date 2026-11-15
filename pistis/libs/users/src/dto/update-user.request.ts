import { createZodDto, zUpdateUserRequest } from '@pistis/core';

/** PUT: the whole editable profile. */
export class UpdateUserRequest extends createZodDto(zUpdateUserRequest) {}
