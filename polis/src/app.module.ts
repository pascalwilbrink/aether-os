import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DatabaseModule,
  EventsModule,
  POLIS_PUBLISHED_EVENTS,
  PolisEventsModule,
  polisConfigModule,
  type Env,
} from '@polis/core';
import { MembershipsModule } from '@polis/memberships';
import { OrganizationsModule } from '@polis/organizations';
import { ProjectsModule } from '@polis/projects';

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [
    polisConfigModule(),
    DatabaseModule,
    // Outbox and relay: events are published to polis.events on RabbitMQ.
    EventsModule.forRoot({
      service: 'polis',
      publish: POLIS_PUBLISHED_EVENTS,
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
    PolisEventsModule,
    OrganizationsModule,
    ProjectsModule,
    MembershipsModule,
  ],
})
export class AppModule {}
