import { createZodDto, zListPersonsPath } from '@polis/core';

export class PersonsParams extends createZodDto(zListPersonsPath) {}
