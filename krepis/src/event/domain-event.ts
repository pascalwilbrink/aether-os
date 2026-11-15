/** Who caused an event (docs/events.md); mirrors the token's `sub` / `act`. */
export interface EventActor {
  readonly sub: string;
  readonly sub_type: 'user' | 'service_account' | 'service';
  /** Present when acting on behalf of someone (token exchange). */
  readonly act?: { readonly sub: string };
}

/**
 * The event envelope (docs/events.md): the local event a service emits and,
 * unchanged, the message published to RabbitMQ.
 */
export interface DomainEvent<TPayload = unknown> {
  /** UUIDv7; consumers deduplicate on it. */
  readonly eventId: string;
  /** The contract name, e.g. `organization.suspended` (also the routing key). */
  readonly eventType: string;
  /** Bumped only for breaking payload changes. */
  readonly schemaVersion: number;
  readonly aggregateId: string;
  /** Increases per aggregate; consumers ignore events older than what they applied. */
  readonly aggregateVersion: number;
  readonly occurredAt: Date;
  /** Null only for platform-level events. */
  readonly organizationId: string | null;
  /** Set when the aggregate is project-scoped. */
  readonly projectId: string | null;
  /** The request's principal (`AuthModule`); null for system work (events, jobs). */
  readonly actor: EventActor | null;
  /** Thin: IDs and states, never secrets or content. */
  readonly payload: TPayload;
}

/** What a service passes to `DomainEvents.emit`; the rest is filled in. */
export type NewDomainEvent<TPayload = unknown> = Pick<
  DomainEvent<TPayload>,
  'eventType' | 'aggregateId' | 'aggregateVersion' | 'payload'
> &
  Partial<
    Pick<
      DomainEvent<TPayload>,
      'schemaVersion' | 'organizationId' | 'projectId' | 'actor'
    >
  >;
