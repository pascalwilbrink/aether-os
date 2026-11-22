import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AGORA_PUBLISHED_EVENTS,
  agoraConfigModule,
  AgoraEventsModule,
  AuthModule,
  DatabaseModule,
  EventsModule,
  HealthModule,
  serviceCheck,
  type Env,
} from '@agora/core';
import { AgentsModule } from '@agora/agents';
import { CouncilsModule } from '@agora/councils';
import { SkillsModule } from '@agora/skills';

// Validation, the /v1 prefix and problem details: configureHttpApp (server.ts).
@Module({
  imports: [
    agoraConfigModule(),
    DatabaseModule,
    // /health and /health/live (Krepis): the database and RabbitMQ, and what it calls.
    HealthModule.forRoot({
      service: 'agora',
      inject: [ConfigService],
      checks: (config: ConfigService<Env, true>) => [
        serviceCheck('pistis', config.get('PISTIS_ISSUER', { infer: true })),
        serviceCheck('polis', config.get('POLIS_URL', { infer: true })),
        serviceCheck(
          'hephaestus',
          config.get('HEPHAESTUS_URL', { infer: true }),
        ),
        serviceCheck('pylon', config.get('PYLON_URL', { infer: true })),
      ],
    }),
    // Publishes Agora's events to agora.events through the outbox; consumes
    // nothing yet.
    EventsModule.forRoot({
      service: 'agora',
      publish: AGORA_PUBLISHED_EVENTS,
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
    AgoraEventsModule,
    AgentsModule,
    CouncilsModule,
    SkillsModule,
  ],
})
export class AppModule {}
