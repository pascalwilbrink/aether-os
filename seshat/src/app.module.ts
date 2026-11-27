import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  DatabaseModule,
  EventsModule,
  HealthModule,
  checkIf,
  serviceCheck,
  SESHAT_PUBLISHED_EVENTS,
  seshatConfigModule,
  SeshatEventsModule,
  type Env,
} from '@seshat/core';
import { EPISTEME_SUBSCRIPTIONS, KnowledgeModule } from '@seshat/knowledge';

/** Proxenos's events repository documents follow (docs/knowledge.md). */
export const PROXENOS_SUBSCRIPTIONS = [
  'git.repository-linked',
  'git.repository-unlinked',
  'git.pushed',
] as const;

/** Polis's events for the department each project is in (department knowledge). */
export const POLIS_SUBSCRIPTIONS = [
  'project.created',
  'project.department-changed',
] as const;

// Validation, the /v1 prefix and problem details: configureHttpApp (server.ts).
@Module({
  imports: [
    seshatConfigModule(),
    DatabaseModule,
    // /health and /health/live (Krepis): the database and RabbitMQ, and what it calls.
    HealthModule.forRoot({
      service: 'seshat',
      inject: [ConfigService],
      checks: (config: ConfigService<Env, true>) => [
        serviceCheck('pistis', config.get('PISTIS_ISSUER', { infer: true })),
        serviceCheck('polis', config.get('POLIS_URL', { infer: true })),
        serviceCheck('loculus', config.get('LOCULUS_URL', { infer: true })),
        ...checkIf(config.get('PYLON_URL', { infer: true }), (url) =>
          serviceCheck('pylon', url),
        ),
        ...checkIf(config.get('PROXENOS_URL', { infer: true }), (url) =>
          serviceCheck('proxenos', url),
        ),
        ...checkIf(config.get('EPISTEME_URL', { infer: true }), (url) =>
          serviceCheck('episteme', url),
        ),
      ],
    }),
    // Publishes Seshat's events to seshat.events through the outbox, and
    // consumes Proxenos's repository links and pushes (seshat.proxenos-events:
    // inbox, retries, dead-lettering).
    EventsModule.forRoot({
      service: 'seshat',
      publish: SESHAT_PUBLISHED_EVENTS,
      subscribe: {
        proxenos: PROXENOS_SUBSCRIPTIONS,
        polis: POLIS_SUBSCRIPTIONS,
        // Episteme's published knowledge (seshat.episteme-events).
        episteme: EPISTEME_SUBSCRIPTIONS,
      },
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
    SeshatEventsModule,
    KnowledgeModule,
  ],
})
export class AppModule {}
