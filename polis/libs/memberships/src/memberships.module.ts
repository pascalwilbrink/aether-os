import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationsModule } from '@polis/organizations';

import { MembershipEntity } from './membership.entity.js';
import { MembershipMapper } from './membership.mapper.js';
import {
  MembershipsController,
  SubjectMembershipsController,
} from './memberships.controller.js';
import { FoundersService } from './founders.service.js';
import { MembershipsService } from './memberships.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([MembershipEntity]), OrganizationsModule],
  controllers: [MembershipsController, SubjectMembershipsController],
  providers: [MembershipsService, MembershipMapper, FoundersService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
