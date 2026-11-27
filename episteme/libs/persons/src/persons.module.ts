import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PersonDirectory } from './person-directory.service.js';
import { PersonEventsListener } from './person-events.listener.js';
import { PersonEntity } from './person.entity.js';

/** Episteme's copy of Polis's persons, who can be stewards. */
@Module({
  imports: [TypeOrmModule.forFeature([PersonEntity])],
  providers: [PersonDirectory, PersonEventsListener],
  exports: [PersonDirectory],
})
export class PersonsModule {}
