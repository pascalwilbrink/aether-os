import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AGORA_PUBLISHED_EVENTS,
  AgoraEventsModule,
  agoraConfigModule,
  AuthModule,
  DatabaseModule,
  EventsModule,
  type Env,
} from '@agora/core';
import { AgentsModule } from '@agora/agents';

// Validation, the /v1 prefix and problem details: configureHttpApp (server.ts).
@Module({
  imports: [
    agoraConfigModule(),
    DatabaseModule,
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
  ],
})
export class AppModule {}
