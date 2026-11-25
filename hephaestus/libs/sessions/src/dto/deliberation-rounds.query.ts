import { createZodDto, zListDeliberationRoundsQuery } from '@hephaestus/core';

export class DeliberationRoundsQuery extends createZodDto(
  zListDeliberationRoundsQuery,
) {}
