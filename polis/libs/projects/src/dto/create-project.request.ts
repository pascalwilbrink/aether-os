import { createZodDto, zCreateProjectRequest } from '@polis/core';

export class CreateProjectRequest extends createZodDto(zCreateProjectRequest) {}
