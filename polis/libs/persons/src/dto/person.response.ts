import { createZodDto, zPersonResponse } from '@polis/core';

export class PersonResponse extends createZodDto(zPersonResponse) {}
