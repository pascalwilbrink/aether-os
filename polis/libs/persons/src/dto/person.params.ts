import { createZodDto, zGetPersonPath } from '@polis/core';

export class PersonParams extends createZodDto(zGetPersonPath) {}
