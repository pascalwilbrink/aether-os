import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DomainEvents } from './domain-events.js';
import { EventConsumer } from './event-consumer.js';
import { EventInbox } from './event-inbox.js';
import {
  EVENTS_OPTIONS,
  RABBITMQ_OPTIONS,
  type EventsModuleOptions,
  type RabbitMqOptions,
} from './events.options.js';
import { InboxMessageEntity } from './inbox-message.entity.js';
import { MessagePublisher } from './message-publisher.js';
import { OutboxMessageEntity } from './outbox-message.entity.js';
import { OutboxRelay } from './outbox-relay.js';
import { RabbitMqMessagePublisher } from './rabbitmq-message.publisher.js';

/**
 * Krepis's messaging module (docs/engineering.md, Events in code).
 *
 * - Outbound: `DomainEvents` (local events and the transactional outbox)
 *   and, with `rabbitmq`, the relay that publishes the outbox to
 *   `<service>.events`.
 * - Inbound, with `subscribe` or `commands`: `EventInbox` (exactly-once handling per
 *   `eventId`) and, with `rabbitmq`, the consumers that feed it.
 *
 * Import it once, in the app module; it's global. No service code depends on
 * RabbitMQ.
 */
@Module({})
export class EventsModule {
  static forRoot(options: EventsModuleOptions): DynamicModule {
    const { rabbitmq, ...events } = options;
    const subscribes =
      Object.keys(events.subscribe ?? {}).length > 0 ||
      (events.commands?.length ?? 0) > 0;
    const exchange = `${events.service}.events`;

    const brokerProviders: Provider[] = rabbitmq
      ? [
          {
            provide: RABBITMQ_OPTIONS,
            inject: rabbitmq.inject ?? [],
            useFactory: rabbitmq.useFactory,
          },
          { provide: MessagePublisher, useClass: RabbitMqMessagePublisher },
          OutboxRelay,
          ...(subscribes ? [EventConsumer] : []),
        ]
      : [];

    return {
      module: EventsModule,
      global: true,
      imports: [
        EventEmitterModule.forRoot(),
        TypeOrmModule.forFeature([
          OutboxMessageEntity,
          ...(subscribes ? [InboxMessageEntity] : []),
        ]),
        ...(rabbitmq
          ? [
              RabbitMQModule.forRootAsync({
                inject: rabbitmq.inject ?? [],
                useFactory: async (...args: unknown[]) => {
                  const settings: RabbitMqOptions = await rabbitmq.useFactory(
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
                      // The receivers' command exchanges, so a command can
                      // be published before its receiver first started.
                      ...Object.keys(events.send ?? {}).map((receiver) => ({
                        name: `${receiver}.commands`,
                        type: 'direct',
                        options: { durable: true },
                      })),
                    ],
                    // Start even while RabbitMQ is down: events wait in the
                    // outbox, and consumers start once it's reachable.
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
        ...(subscribes ? [EventInbox] : []),
        ...brokerProviders,
      ],
      exports: [
        DomainEvents,
        ...(subscribes ? [EventInbox] : []),
        ...(rabbitmq ? [OutboxRelay] : []),
        ...(rabbitmq && subscribes ? [EventConsumer] : []),
      ],
    };
  }
}
