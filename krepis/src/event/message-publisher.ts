/** A message as the relay hands it to the broker. */
export interface OutgoingMessage {
  exchange: string;
  routingKey: string;
  messageId: string;
  type: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/**
 * The broker, behind an interface so services never depend on RabbitMQ and
 * tests can replace it. `publish` resolves once the broker has accepted the
 * message (publisher confirm) and rejects otherwise.
 */
export abstract class MessagePublisher {
  abstract publish(message: OutgoingMessage): Promise<void>;
}
