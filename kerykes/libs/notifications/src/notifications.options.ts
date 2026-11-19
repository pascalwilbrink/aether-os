export const NOTIFICATIONS_OPTIONS = Symbol('NOTIFICATIONS_OPTIONS');

export interface NotificationsOptions {
  /** Whether emails are sent at all (`EMAIL_DRIVER` isn't `none`). */
  emailEnabled: boolean;
  /** Iris's origin, for the links in emails. */
  irisUrl: string;
  from: string;
  /** How often `EmailDispatcher` runs; 0: never on its own (tests). */
  pollIntervalMs: number;
  maxAttempts: number;
  backoffMs: number;
}
