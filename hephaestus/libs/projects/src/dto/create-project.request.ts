import { createZodDto, zCreateProjectRequest } from '@hephaestus/core';

export class CreateProjectRequest extends createZodDto(zCreateProjectRequest) {}
