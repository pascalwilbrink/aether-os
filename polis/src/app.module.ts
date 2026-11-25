import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  DatabaseModule,
  EventsModule,
  HealthModule,
  POLIS_PUBLISHED_EVENTS,
  polisConfigModule,
  PolisEventsModule,
  serviceCheck,
  type Env,
} from '@polis/core';
import { DepartmentsModule } from '@polis/departments';
import { MembershipsModule } from '@polis/memberships';
import { PersonsModule } from '@polis/persons';
import { OrganizationsModule } from '@polis/organizations';
import { ProjectMembershipsModule } from '@polis/project-memberships';
import { ProjectsModule } from '@polis/projects';
import { UsersModule } from '@polis/users';

/** Pistis's events Polis keeps a copy from. */
export const PISTIS_SUBSCRIPTIONS = ['user.created'] as const;

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [
    polisConfigModule(),
    DatabaseModule,
    // /health and /health/live (Krepis): the database and RabbitMQ, and what it calls.
    HealthModule.forRoot({
      service: 'polis',
      inject: [ConfigService],
      checks: (config: ConfigService<Env, true>) => [
        serviceCheck('pistis', config.get('PISTIS_ISSUER', { infer: true })),
      ],
    }),
    // Outbox and relay: events are published to polis.events on RabbitMQ.
    EventsModule.forRoot({
      service: 'polis',
      publish: POLIS_PUBLISHED_EVENTS,
      // Through the inbox (deduplicated), from polis.pistis-events.
      subscribe: { pistis: PISTIS_SUBSCRIPTIONS },
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
    // Pistis tokens on every request, and the permission table (Krepis).
    AuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        issuer: config.get('PISTIS_ISSUER', { infer: true }),
        jwks: config.get('PISTIS_JWKS', { infer: true }),
      }),
    }),
    PolisEventsModule,
    OrganizationsModule,
    DepartmentsModule,
    ProjectsModule,
    MembershipsModule,
    ProjectMembershipsModule,
    UsersModule,
    PersonsModule,
  ],
})
export class AppModule {}
