import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DatabaseModule,
  EventsModule,
  hephaestusConfigModule,
  type Env,
} from '@hephaestus/core';
import { AgentsModule } from '@hephaestus/agents';
import { TenancyModule } from '@hephaestus/tenancy';
import { WorkspacesModule } from '@hephaestus/workspaces';

/** The Polis events Hephaestus keeps organization and project status from. */
export const POLIS_SUBSCRIPTIONS = [
  'organization.created',
  'organization.suspended',
  'organization.reactivated',
  'project.created',
  'project.archived',
] as const;

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [
    hephaestusConfigModule(),
    DatabaseModule,
    // Consumes Polis's events from hephaestus.polis-events (inbox, retries,
    // dead-lettering); Hephaestus publishes nothing yet.
    EventsModule.forRoot({
      service: 'hephaestus',
      publish: [],
      subscribe: { polis: POLIS_SUBSCRIPTIONS },
      rabbitmq: {
        inject: [ConfigService],
        useFactory: (config: ConfigService<Env, true>) => ({
          url: config.get('RABBITMQ_URL', { infer: true }),
          relayIntervalMs: config.get('OUTBOX_RELAY_INTERVAL_MS', {
            infer: true,
          }),
        }),
      },
    }),
    TenancyModule,
    AgentsModule,
    WorkspacesModule,
  ],
})
export class AppModule {}
