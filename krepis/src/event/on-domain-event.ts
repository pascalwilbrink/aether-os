import { OnEvent } from '@nestjs/event-emitter';

/**
 * Handles a local event: `@OnDomainEvent('polis.organization.suspended')`.
 * Use this, not `@OnEvent`: Nest's default swallows handler errors, which
 * would let a failed handler commit its transaction (or acknowledge a
 * message that should be retried). Here an error fails the emit, rolls the
 * transaction back and, for consumed events, retries the message.
 */
export function OnDomainEvent(event: string): MethodDecorator {
  return OnEvent(event, { suppressErrors: false });
}
