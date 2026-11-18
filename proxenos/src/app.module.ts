import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  DatabaseModule,
  EventsModule,
  PROXENOS_PUBLISHED_EVENTS,
  ProxenosEventsModule,
  proxenosConfigModule,
  type Env,
} from '@proxenos/core';
import { InstallationsModule } from '@proxenos/installations';
import { RepositoriesModule } from '@proxenos/repositories';
import { WebhooksModule } from '@proxenos/webhooks';

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [
    proxenosConfigModule(),
    DatabaseModule,
    // Outbox and relay: events are published to proxenos.events on RabbitMQ.
    EventsModule.forRoot({
      service: 'proxenos',
      publish: PROXENOS_PUBLISHED_EVENTS,
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
    ProxenosEventsModule,
    InstallationsModule,
    RepositoriesModule,
    WebhooksModule,
  ],
})
export class AppModule {}
