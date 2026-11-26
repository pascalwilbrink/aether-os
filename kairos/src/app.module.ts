import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  DatabaseModule,
  EventsModule,
  HealthModule,
  KAIROS_PUBLISHED_EVENTS,
  kairosConfigModule,
  KairosEventsModule,
  serviceCheck,
  type Env,
} from '@kairos/core';
import { AutomationsModule } from '@kairos/automations';

/** Proxenos's events automations fire on (docs/git.md, Webhooks). */
export const PROXENOS_SUBSCRIPTIONS = [
  'github.issue.opened',
  'github.issue.labeled',
  'github.issue-comment.created',
] as const;

/** Ergon's assignments, which `ergon.work-assigned` automations fire on. */
export const ERGON_SUBSCRIPTIONS = ['work-assignment.changed'] as const;

/** Hephaestus's answers to Kairos's `task.create` commands. */
export const HEPHAESTUS_SUBSCRIPTIONS = [
  'task.created',
  'task.create-rejected',
] as const;

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [
    kairosConfigModule(),
    DatabaseModule,
    // /health and /health/live (Krepis): the database and RabbitMQ, and what it calls.
    HealthModule.forRoot({
      service: 'kairos',
      inject: [ConfigService],
      checks: (config: ConfigService<Env, true>) => [
        serviceCheck('pistis', config.get('PISTIS_ISSUER', { infer: true })),
        serviceCheck('polis', config.get('POLIS_URL', { infer: true })),
        serviceCheck('ergon', config.get('ERGON_URL', { infer: true })),
      ],
    }),
    // Consumes Proxenos's, Ergon's and Hephaestus's events
    // (kairos.proxenos-events, kairos.ergon-events, kairos.hephaestus-events:
    // inbox, retries, dead-lettering); publishes
    // its own to kairos.events and sends task.create to hephaestus.commands,
    // both through the outbox.
    EventsModule.forRoot({
      service: 'kairos',
      publish: KAIROS_PUBLISHED_EVENTS,
      subscribe: {
        proxenos: PROXENOS_SUBSCRIPTIONS,
        ergon: ERGON_SUBSCRIPTIONS,
        hephaestus: HEPHAESTUS_SUBSCRIPTIONS,
      },
      send: { hephaestus: ['task.create'] },
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
    KairosEventsModule,
    AutomationsModule,
  ],
})
export class AppModule {}
