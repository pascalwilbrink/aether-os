import { createZodDto, zCreateTeamRequest } from '@polis/core';

export class CreateTeamRequest extends createZodDto(zCreateTeamRequest) {}
