import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { PlatformAccess, ZodSerializerDto } from '@polis/core';

import { AnnouncementResponse } from './dto/announcement.response.js';
import { PersonsService } from './persons.service.js';

/** Platform operators: every organization's persons, published again. */
@Controller('persons')
@PlatformAccess('platform:manage')
export class PersonsAnnounceController {
  constructor(private readonly persons: PersonsService) {}

  /** The backfill for services that keep a copy of the persons (Ergon). */
  @Post('announce')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(AnnouncementResponse)
  async announce() {
    return { announced: await this.persons.announce() };
  }
}
