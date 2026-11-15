import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { ZodSerializerDto } from '@polis/core';

import { CreateMembershipRequest } from './dto/create-membership.request.js';
import { ListMembershipsOfSubjectQuery } from './dto/list-memberships-of-subject.query.js';
import { ListMembershipsQuery } from './dto/list-memberships.query.js';
import { MembershipPage } from './dto/membership-page.response.js';
import { MembershipParams } from './dto/membership.params.js';
import { MembershipResponse } from './dto/membership.response.js';
import { MembershipsParams } from './dto/memberships.params.js';
import { UpdateMembershipRequest } from './dto/update-membership.request.js';
import { MembershipsService } from './memberships.service.js';

@Controller('organizations/:organizationId/memberships')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Post()
  @ZodSerializerDto(MembershipResponse)
  create(
    @Param() { organizationId }: MembershipsParams,
    @Body() body: CreateMembershipRequest,
  ) {
    return this.memberships.create(organizationId, body);
  }

  @Get()
  @ZodSerializerDto(MembershipPage)
  list(
    @Param() { organizationId }: MembershipsParams,
    @Query() query: ListMembershipsQuery,
  ) {
    return this.memberships.list(organizationId, query);
  }

  @Get(':membershipId')
  @ZodSerializerDto(MembershipResponse)
  findById(@Param() { organizationId, membershipId }: MembershipParams) {
    return this.memberships.findById(organizationId, membershipId);
  }

  @Put(':membershipId')
  @ZodSerializerDto(MembershipResponse)
  update(
    @Param() { organizationId, membershipId }: MembershipParams,
    @Body() body: UpdateMembershipRequest,
  ) {
    return this.memberships.update(organizationId, membershipId, body);
  }

  @Delete(':membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param() { organizationId, membershipId }: MembershipParams) {
    return this.memberships.delete(organizationId, membershipId);
  }
}

/** A principal's memberships across organizations. */
@Controller('memberships')
export class SubjectMembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  @ZodSerializerDto(MembershipPage)
  list(
    @Query() { subjectType, subject, ...page }: ListMembershipsOfSubjectQuery,
  ) {
    return this.memberships.listOfSubject(subjectType, subject, page);
  }
}
