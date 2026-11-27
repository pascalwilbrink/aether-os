import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  DatabaseModule,
  EPISTEME_PUBLISHED_EVENTS,
  EventsModule,
  epistemeConfigModule,
  EpistemeEventsModule,
  HealthModule,
  serviceCheck,
  type Env,
} from '@episteme/core';
import { KnowledgeModule } from '@episteme/knowledge';

/** Polis's persons, who can be stewards. */
export const POLIS_SUBSCRIPTIONS = [
  'person.created',
  'person.updated',
  'person.deleted',
] as const;

/** Seshat's answers for published versions (their indexing). */
export const SESHAT_SUBSCRIPTIONS = [
  'knowledge-indexing.completed',
  'knowledge-indexing.failed',
] as const;

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [
    epistemeConfigModule(),
    DatabaseModule,
    // /health and /health/live (Krepis): the database and RabbitMQ, and what it calls.
    HealthModule.forRoot({
      service: 'episteme',
      inject: [ConfigService],
      checks: (config: ConfigService<Env, true>) => [
        serviceCheck('pistis', config.get('PISTIS_ISSUER', { infer: true })),
        serviceCheck('polis', config.get('POLIS_URL', { infer: true })),
      ],
    }),
    // Publishes its events to episteme.events through the outbox; consumes
    // Polis's persons (episteme.polis-events) and Seshat's indexing answers
    // (episteme.seshat-events): inbox, retries, dead-lettering.
    EventsModule.forRoot({
      service: 'episteme',
      publish: EPISTEME_PUBLISHED_EVENTS,
      subscribe: { polis: POLIS_SUBSCRIPTIONS, seshat: SESHAT_SUBSCRIPTIONS },
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
    EpistemeEventsModule,
    KnowledgeModule,
  ],
})
export class AppModule {}
