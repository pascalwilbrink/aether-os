import { createZodDto, zListTeamsPath } from '@polis/core';

export class TeamsParams extends createZodDto(zListTeamsPath) {}
