import { Module } from '@nestjs/common';

import { DatabaseModule, polisConfigModule } from '@polis/core';
import { MembershipsModule } from '@polis/memberships';
import { OrganizationsModule } from '@polis/organizations';
import { ProjectsModule } from '@polis/projects';

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [
    polisConfigModule(),
    DatabaseModule,
    OrganizationsModule,
    ProjectsModule,
    MembershipsModule,
  ],
})
export class AppModule {}
