import { createZodDto, zListTeamsQuery } from '@polis/core';

export class ListTeamsQuery extends createZodDto(zListTeamsQuery) {}
