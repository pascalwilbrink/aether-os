import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { DatabaseModule, DomainErrorFilter } from '@hephaestus/core';
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
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
