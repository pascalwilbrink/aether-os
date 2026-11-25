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

/**
 * Payload of `user.disabled`.
 */
export interface UserDisabled {
  userId: string;
  displayName: string;
  /**
   * Contact only; never used to find or link a user.
   */
  email: string | null;
  status: 'active' | 'disabled';
}

/**
 * Payload of `user.enabled`.
 */
export interface UserEnabled {
  userId: string;
  displayName: string;
  /**
   * Contact only; never used to find or link a user.
   */
  email: string | null;
  status: 'active' | 'disabled';
}

/**
 * Payload of `user.updated`.
 */
export interface UserUpdated {
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
  'user.disabled': UserDisabled;
  'user.enabled': UserEnabled;
  'user.updated': UserUpdated;
}

export type PistisEventType = keyof PistisEventPayloads;

/** Every Pistis event type in the spec. */
export const PISTIS_EVENT_TYPES = [
  'user.created',
  'user.disabled',
  'user.enabled',
  'user.updated',
] as const satisfies readonly PistisEventType[];
