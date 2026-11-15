import { createZodDto, zCreateUserRequest } from '@pistis/core';

export class CreateUserRequest extends createZodDto(zCreateUserRequest) {}
