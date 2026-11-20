import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AgentsModule } from '@pylon/agents';
import { CatalogModule } from '@pylon/catalog';
import {
  PYLON_PUBLISHED_EVENTS,
  PylonEventsModule,
  pylonConfigModule,
  AuthModule,
  DatabaseModule,
  EventsModule,
  type Env,
} from '@pylon/core';
import { GatewayModule } from '@pylon/gateway';
import { KeysModule } from '@pylon/keys';
import { UsageModule } from '@pylon/usage';

/** Agora's events: Pylon's copy of agents (libs/agents), for their keys and budgets. */
export const AGORA_SUBSCRIPTIONS = ['agent.created', 'agent.archived'] as const;

// Validation, the /v1 prefix, problem details and the body limit:
// configurePylonApp (server.ts).
@Module({
  imports: [
    pylonConfigModule(),
    DatabaseModule,
    // Publishes Pylon's events to pylon.events through the outbox, and
    // consumes Agora's.
    EventsModule.forRoot({
      service: 'pylon',
      publish: PYLON_PUBLISHED_EVENTS,
      subscribe: { agora: AGORA_SUBSCRIPTIONS },
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
    PylonEventsModule,
    AgentsModule,
    CatalogModule,
    KeysModule,
    UsageModule,
    GatewayModule,
  ],
})
export class AppModule {}
