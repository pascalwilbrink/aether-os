import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApiKeyEntity } from './api-key.entity.js';
import { ServiceAccountEntity } from './service-account.entity.js';
import { ServiceAccountMapper } from './service-account.mapper.js';
import { ServiceAccountsController } from './service-accounts.controller.js';
import { ServiceAccountsService } from './service-accounts.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceAccountEntity, ApiKeyEntity])],
  controllers: [ServiceAccountsController],
  providers: [ServiceAccountsService, ServiceAccountMapper],
  exports: [ServiceAccountsService],
})
export class ServiceAccountsModule {}
