import { createZodDto, zUserResponse } from '@pistis/core';

export class UserResponse extends createZodDto(zUserResponse) {}
