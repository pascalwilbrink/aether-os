import { createZodDto, zUpdateTeamRequest } from '@polis/core';

export class UpdateTeamRequest extends createZodDto(zUpdateTeamRequest) {}
