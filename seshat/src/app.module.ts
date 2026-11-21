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
import { KnowledgeModule } from '@seshat/knowledge';

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
      ],
    }),
    // Publishes Seshat's events to seshat.events through the outbox; consumes
    // nothing yet.
    EventsModule.forRoot({
      service: 'seshat',
      publish: SESHAT_PUBLISHED_EVENTS,
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
