import { createZodDto, zListTeamMembersQuery } from '@polis/core';

export class ListTeamMembersQuery extends createZodDto(zListTeamMembersQuery) {}
