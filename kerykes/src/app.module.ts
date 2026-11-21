import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  DatabaseModule,
  EventsModule,
  kerykesConfigModule,
  type Env,
} from '@kerykes/core';
import { MembershipsModule } from '@kerykes/memberships';
import { NotificationsModule } from '@kerykes/notifications';

/** Polis's membership events: Kerykes's copy of who belongs where, and "you were added". */
export const POLIS_SUBSCRIPTIONS = [
  'membership.granted',
  'membership.role-changed',
  'membership.revoked',
  'project-membership.granted',
  'project-membership.role-changed',
  'project-membership.revoked',
] as const;

/** Hephaestus's events that need people (docs/notifications.md, Notifications). */
export const HEPHAESTUS_SUBSCRIPTIONS = [
  'task.awaiting-review',
  'task.failed',
  'task.succeeded',
  'task.paused',
] as const;

/** Pylon's budget events that need people (docs/pylon.md, Events). */
export const PYLON_SUBSCRIPTIONS = ['budget.threshold-reached'] as const;

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [
    kerykesConfigModule(),
    DatabaseModule,
    // Consumes Polis's, Hephaestus's and Pylon's events
    // (kerykes.polis-events, kerykes.hephaestus-events, kerykes.pylon-events:
    // inbox, retries, dead-lettering). Kerykes publishes nothing yet.
    EventsModule.forRoot({
      service: 'kerykes',
      publish: [],
      subscribe: {
        polis: POLIS_SUBSCRIPTIONS,
        hephaestus: HEPHAESTUS_SUBSCRIPTIONS,
        pylon: PYLON_SUBSCRIPTIONS,
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
    MembershipsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
