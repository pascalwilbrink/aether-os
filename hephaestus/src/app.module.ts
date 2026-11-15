import { Module } from '@nestjs/common';

import { DatabaseModule, hephaestusConfigModule } from '@hephaestus/core';
import { AgentsModule } from '@hephaestus/agents';
import { OrganizationsModule } from '@hephaestus/organizations';
import { ProjectsModule } from '@hephaestus/projects';
import { WorkspacesModule } from '@hephaestus/workspaces';

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [
    hephaestusConfigModule(),
    DatabaseModule,
    OrganizationsModule,
    ProjectsModule,
    AgentsModule,
    WorkspacesModule,
  ],
})
export class AppModule {}
