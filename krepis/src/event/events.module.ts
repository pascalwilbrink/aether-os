import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DomainEvents } from './domain-events.js';
import {
  EVENTS_OPTIONS,
  RELAY_OPTIONS,
  type EventsModuleOptions,
  type RelayOptions,
} from './events.options.js';
import { MessagePublisher } from './message-publisher.js';
import { OutboxRelay } from './outbox-relay.js';
import { OutboxMessageEntity } from './outbox-message.entity.js';
import { RabbitMqMessagePublisher } from './rabbitmq-message.publisher.js';

/**
 * Krepis's messaging module, outbound side: `DomainEvents` (local events and
 * the transactional outbox) and, with `relay`, the relay that publishes the
 * outbox to the service's topic exchange on RabbitMQ. Import it once, in the
 * app module; it's global. No service code depends on RabbitMQ.
 */
@Module({})
export class EventsModule {
  static forRoot(options: EventsModuleOptions): DynamicModule {
    const { relay, ...events } = options;
    const exchange = `${events.service}.events`;
    const relayProviders: Provider[] = relay
      ? [
          {
            provide: RELAY_OPTIONS,
            inject: relay.inject ?? [],
            useFactory: relay.useFactory,
          },
          { provide: MessagePublisher, useClass: RabbitMqMessagePublisher },
          OutboxRelay,
        ]
      : [];

    return {
      module: EventsModule,
      global: true,
      imports: [
        EventEmitterModule.forRoot(),
        TypeOrmModule.forFeature([OutboxMessageEntity]),
        ...(relay
          ? [
              RabbitMQModule.forRootAsync({
                inject: relay.inject ?? [],
                useFactory: async (...args: unknown[]) => {
                  const settings: RelayOptions = await relay.useFactory(
                    ...(args as never[]),
                  );
                  return {
                    uri: settings.url,
                    exchanges: [
                      {
                        name: exchange,
                        type: 'topic',
                        options: { durable: true },
                      },
                    ],
                    // Start even while RabbitMQ is down: events wait in the outbox.
                    connectionInitOptions: { wait: false },
                    registerHandlers: false,
                    enableControllerDiscovery: false,
                  };
                },
              }),
            ]
          : []),
      ],
      providers: [
        { provide: EVENTS_OPTIONS, useValue: events },
        DomainEvents,
        ...relayProviders,
      ],
      exports: [DomainEvents, ...(relay ? [OutboxRelay] : [])],
    };
  }
}
