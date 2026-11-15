import { z } from 'zod';

import type { DomainEvent } from './domain-event.js';

/** A consumed message that isn't a valid envelope; never retried. */
export class InvalidEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEventError';
  }
}

const zEnvelope = z.object({
  eventId: z.uuid(),
  eventType: z.string().min(1),
  schemaVersion: z.int().min(1),
  aggregateId: z.string().min(1),
  aggregateVersion: z.int().min(1),
  occurredAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
  organizationId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  actor: z
    .object({
      sub: z.string(),
      sub_type: z.enum(['user', 'service_account', 'service']),
      act: z.object({ sub: z.string() }).optional(),
    })
    .nullable(),
  payload: z.record(z.string(), z.unknown()),
});

/**
 * Parses a message body as the `DomainEvent` envelope (docs/events.md).
 * Payloads are typed by the consumer from the producer's AsyncAPI spec.
 */
export function parseEventEnvelope(body: Buffer | string): DomainEvent {
  let json: unknown;
  try {
    json = JSON.parse(body.toString());
  } catch {
    throw new InvalidEventError('The message is not JSON.');
  }
  const result = zEnvelope.safeParse(json);
  if (!result.success) {
    throw new InvalidEventError(
      `The message is not an event envelope: ${result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  return result.data;
}
