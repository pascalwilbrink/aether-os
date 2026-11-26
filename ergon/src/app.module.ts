import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  DatabaseModule,
  EventsModule,
  HealthModule,
  ERGON_PUBLISHED_EVENTS,
  ergonConfigModule,
  ErgonEventsModule,
  serviceCheck,
  type Env,
} from '@ergon/core';
import { WorkItemsModule } from '@ergon/work-items';

/** Polis's persons, whom work can be assigned to. */
export const POLIS_SUBSCRIPTIONS = [
  'person.created',
  'person.updated',
  'person.deleted',
] as const;

/** Agora's agents, which work can be assigned to. */
export const AGORA_SUBSCRIPTIONS = ['agent.created', 'agent.archived'] as const;

/** Hephaestus's tasks, which Ergon follows for the work items they're done for. */
export const HEPHAESTUS_SUBSCRIPTIONS = [
  'task.created',
  'task.status-changed',
  'task.succeeded',
  'task.failed',
  'task.cancelled',
] as const;

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [
    ergonConfigModule(),
    DatabaseModule,
    // /health and /health/live (Krepis): the database and RabbitMQ, and what it calls.
    HealthModule.forRoot({
      service: 'ergon',
      inject: [ConfigService],
      checks: (config: ConfigService<Env, true>) => [
        serviceCheck('pistis', config.get('PISTIS_ISSUER', { infer: true })),
        serviceCheck('polis', config.get('POLIS_URL', { infer: true })),
      ],
    }),
    // Consumes Polis's persons, Agora's agents and Hephaestus's tasks
    // (ergon.polis-events, ergon.agora-events, ergon.hephaestus-events:
    // inbox, retries, dead-lettering); publishes its own events to
    // ergon.events through the outbox.
    EventsModule.forRoot({
      service: 'ergon',
      publish: ERGON_PUBLISHED_EVENTS,
      subscribe: {
        polis: POLIS_SUBSCRIPTIONS,
        agora: AGORA_SUBSCRIPTIONS,
        hephaestus: HEPHAESTUS_SUBSCRIPTIONS,
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
    ErgonEventsModule,
    WorkItemsModule,
  ],
})
export class AppModule {}
