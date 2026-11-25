import { createZodDto, zListSessionSynthesesQuery } from '@hephaestus/core';

export class SessionSynthesesQuery extends createZodDto(
  zListSessionSynthesesQuery,
) {}
