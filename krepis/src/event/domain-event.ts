export interface DomainEvent<TPayload = unknown> {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}
