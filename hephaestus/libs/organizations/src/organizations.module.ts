import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransactionModule } from '@hephaestus/core';

import { OrganizationService } from './application/service/organization.service.js';
import { OrganizationRepository } from './domain/repository/organization.repository.js';
import { OrganizationEntity } from './infrastructure/persistence/entity/organization.entity.js';
import { OrganizationMapper } from './infrastructure/persistence/mapper/organization.mapper.js';
import { TypeOrmOrganizationRepository } from './infrastructure/persistence/repository/typeorm-organization.repository.js';
import { OrganizationsController } from './presentation/http/organizations.controller.js';

@Module({
  imports: [
    // Registers the entity with autoLoadEntities; the repository resolves
    // it through TypeOrmTransactionManager.
    TypeOrmModule.forFeature([OrganizationEntity]),
    TransactionModule,
  ],
  controllers: [OrganizationsController],
  providers: [
    OrganizationService,
    OrganizationMapper,
    {
      provide: OrganizationRepository,
      useClass: TypeOrmOrganizationRepository,
    },
  ],
  exports: [OrganizationService],
})
export class OrganizationsModule {}
