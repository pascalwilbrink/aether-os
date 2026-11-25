import { createZodDto, zRemoveTeamMemberPath } from '@polis/core';

export class TeamMemberParams extends createZodDto(zRemoveTeamMemberPath) {}
