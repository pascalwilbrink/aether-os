import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  DatabaseModule,
  EventsModule,
  KAIROS_PUBLISHED_EVENTS,
  KairosEventsModule,
  kairosConfigModule,
  type Env,
} from '@kairos/core';
import { AutomationsModule } from '@kairos/automations';

/** Proxenos's events automations fire on (docs/git.md, Webhooks). */
export const PROXENOS_SUBSCRIPTIONS = [
  'github.issue.opened',
  'github.issue.labeled',
  'github.issue-comment.created',
] as const;

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
    // Consumes Proxenos's and Hephaestus's events (kairos.proxenos-events,
    // kairos.hephaestus-events: inbox, retries, dead-lettering); publishes
    // its own to kairos.events and sends task.create to hephaestus.commands,
    // both through the outbox.
    EventsModule.forRoot({
      service: 'kairos',
      publish: KAIROS_PUBLISHED_EVENTS,
      subscribe: {
        proxenos: PROXENOS_SUBSCRIPTIONS,
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
