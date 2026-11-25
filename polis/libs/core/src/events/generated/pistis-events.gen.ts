// This file is generated from pistis.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `user.created`.
 */
export interface UserCreated {
  userId: string;
  displayName: string;
  /**
   * Contact only; never used to find or link a user.
   */
  email: string | null;
  status: 'active' | 'disabled';
}

/** Every Pistis event type, mapped to its payload. */
export interface PistisEventPayloads {
  'user.created': UserCreated;
}

export type PistisEventType = keyof PistisEventPayloads;

/** Every Pistis event type in the spec. */
export const PISTIS_EVENT_TYPES = [
  'user.created',
] as const satisfies readonly PistisEventType[];
