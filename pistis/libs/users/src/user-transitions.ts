import type { ApiTypes } from '@pistis/core';

export type UserStatus = ApiTypes.UserStatus;
export type UserAction = 'disable' | 'enable';

/** Both actions are allowed in every state and are idempotent. */
const TRANSITIONS: Record<UserAction, Record<UserStatus, UserStatus>> = {
  disable: { active: 'disabled', disabled: 'disabled' },
  enable: { active: 'active', disabled: 'active' },
};

export function nextUserStatus(
  current: UserStatus,
  action: UserAction,
): UserStatus {
  return TRANSITIONS[action][current];
}

/** Only active users may sign in. */
export function userCanSignIn(status: UserStatus): boolean {
  return status === 'active';
}
