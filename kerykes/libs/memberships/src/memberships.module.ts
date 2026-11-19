import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DirectoryModule } from '@kerykes/directory';

import {
  OrganizationMemberEntity,
  OrganizationSyncEntity,
  ProjectMemberEntity,
} from './membership.entities.js';
import { MembershipsService } from './memberships.service.js';
import { PolisMembershipsListener } from './polis-memberships.listener.js';

/** Who belongs where, copied from Polis: who may be told what. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationMemberEntity,
      ProjectMemberEntity,
      OrganizationSyncEntity,
    ]),
    DirectoryModule,
  ],
  providers: [MembershipsService, PolisMembershipsListener],
  exports: [MembershipsService],
})
export class MembershipsModule {}
