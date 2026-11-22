import { createZodDto, zListSessionMessagesQuery } from '@hephaestus/core';

export class SessionMessagesQuery extends createZodDto(
  zListSessionMessagesQuery,
) {}
