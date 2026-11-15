import { Module } from '@nestjs/common';
import { DatabaseModule } from '@hephaestus/core';
import { AgentsModule } from '@hephaestus/agents';
import { OrganizationsModule } from '@hephaestus/organizations';
import { ProjectsModule } from '@hephaestus/projects';
import { WorkspacesModule } from '@hephaestus/workspaces';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    DatabaseModule,
    OrganizationsModule,
    ProjectsModule,
    AgentsModule,
    WorkspacesModule,
  ],
  controllers: [AppController],
  // Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
  providers: [AppService],
})
export class AppModule {}
