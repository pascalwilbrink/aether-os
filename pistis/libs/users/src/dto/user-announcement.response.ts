import { createZodDto, zUserAnnouncementResponse } from '@pistis/core';

export class UserAnnouncementResponse extends createZodDto(
  zUserAnnouncementResponse,
) {}
