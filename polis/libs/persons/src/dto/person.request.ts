import { createZodDto, zPersonRequest } from '@polis/core';

export class PersonRequest extends createZodDto(zPersonRequest) {}
