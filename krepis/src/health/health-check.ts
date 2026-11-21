import { Injectable } from '@nestjs/common';

/**
 * One thing a service depends on (its database, RabbitMQ, the object
 * store, another service), checked whenever `/health` is asked.
 */
export interface HealthCheck {
  /** Its key in the response: `database`, `rabbitmq`, `polis`, `storage`. */
  name: string;
  /**
   * Whether the service can't do its work without it (default `true`). A
   * required check that fails makes the service `down` (`503`); any other
   * makes it `degraded` (still `200`).
   */
  required?: boolean;
  /** How long it may take before it counts as down (default 3 s). */
  timeoutMs?: number;
  /**
   * Resolves when it's up, with details worth showing (never secrets);
   * throws when it's down, with a message saying why.
   */
  check(signal: AbortSignal): Promise<Record<string, unknown> | void>;
}

export type CheckStatus = 'up' | 'down';

export interface CheckResult {
  status: CheckStatus;
  required: boolean;
  latencyMs: number;
  /** Why it's down. */
  error?: string;
  [detail: string]: unknown;
}

export type ServiceStatus = 'ok' | 'degraded' | 'down';

/** `GET /health`'s body. */
export interface HealthReport {
  status: ServiceStatus;
  service: string;
  /** Set while the service shuts down: it takes no more work. */
  shuttingDown?: true;
  checks: Record<string, CheckResult>;
}

/**
 * The checks of a service: its configured ones (`HealthModule.forRoot`)
 * and those its feature modules add, each with what only it can reach (the
 * object store, the SMTP server, Docker):
 *
 * ```ts
 * constructor(@Optional() health?: HealthRegistry) {
 *   health?.register({ name: 'storage', check: () => storage.ping() });
 * }
 * ```
 */
@Injectable()
export class HealthRegistry {
  private readonly checks = new Map<string, HealthCheck>();

  register(...checks: HealthCheck[]): void {
    for (const check of checks) {
      this.checks.set(check.name, check);
    }
  }

  all(): HealthCheck[] {
    return [...this.checks.values()];
  }
}
