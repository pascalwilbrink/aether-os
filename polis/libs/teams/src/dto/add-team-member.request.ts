import { createZodDto, zAddTeamMemberRequest } from '@polis/core';

export class AddTeamMemberRequest extends createZodDto(zAddTeamMemberRequest) {}
