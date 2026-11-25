import { createZodDto, zGetTeamPath } from '@polis/core';

export class TeamParams extends createZodDto(zGetTeamPath) {}
