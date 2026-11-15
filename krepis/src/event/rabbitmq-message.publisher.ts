import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';

import { MessagePublisher, type OutgoingMessage } from './message-publisher.js';

const PUBLISH_TIMEOUT_MS = 10_000;

/**
 * Publishes over RabbitMQ (`@golevelup/nestjs-rabbitmq`, on a confirm
 * channel): persistent, JSON, with the event ID as `messageId` and the event
 * type as `type`. Times out instead of waiting forever while disconnected.
 */
@Injectable()
export class RabbitMqMessagePublisher extends MessagePublisher {
  constructor(private readonly amqp: AmqpConnection) {
    super();
  }

  async publish(message: OutgoingMessage): Promise<void> {
    await this.amqp.publish(
      message.exchange,
      message.routingKey,
      message.body,
      {
        messageId: message.messageId,
        type: message.type,
        contentType: 'application/json',
        persistent: true,
        headers: message.headers,
        timestamp: Math.floor(Date.now() / 1000),
        // amqp-connection-manager: reject if not confirmed in time.
        timeout: PUBLISH_TIMEOUT_MS,
      } as Parameters<AmqpConnection['publish']>[3],
    );
  }
}
