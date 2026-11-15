import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationEntity } from './organization.entity.js';
import { OrganizationMapper } from './organization.mapper.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationEntity])],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationMapper],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
