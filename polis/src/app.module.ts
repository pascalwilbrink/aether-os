import { Module } from '@nestjs/common';
import { DatabaseModule } from '@polis/core';
import { OrganizationsModule } from '@polis/organizations';
import { ProjectsModule } from '@polis/projects';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [DatabaseModule, OrganizationsModule, ProjectsModule],
  controllers: [AppController],
  // Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
  providers: [AppService],
})
export class AppModule {}
