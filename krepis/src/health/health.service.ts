import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';

import {
  HealthRegistry,
  type CheckResult,
  type HealthCheck,
  type HealthReport,
  type ServiceStatus,
} from './health-check.js';
import { HEALTH_OPTIONS, type HealthOptions } from './health.options.js';

const DEFAULT_TIMEOUT_MS = 3000;
/** A report is reused this long, so `/health` asked often costs no more. */
const REPORT_TTL_MS = 2000;

/**
 * Runs a service's checks for `GET /health`: its database and RabbitMQ
 * when it has them, plus the registered ones, all at once, each within its
 * timeout. Logs each check going down and coming back, once.
 */
@Injectable()
export class HealthService implements OnModuleInit, BeforeApplicationShutdown {
  private readonly logger = new Logger(HealthService.name);
  private readonly lastStatus = new Map<string, string>();
  private latest: { at: number; report: Promise<HealthReport> } | null = null;
  private shuttingDown = false;

  constructor(
    @Inject(HEALTH_OPTIONS) private readonly options: HealthOptions,
    private readonly registry: HealthRegistry,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    const dataSource = this.find(DataSource);
    const amqp = this.find(AmqpConnection);
    this.registry.register(
      ...(dataSource ? [databaseCheck(dataSource)] : []),
      ...(amqp ? [rabbitMqCheck(amqp)] : []),
      ...this.options.checks,
    );
  }

  beforeApplicationShutdown(): void {
    this.shuttingDown = true;
    this.latest = null;
  }

  get service(): string {
    return this.options.service;
  }

  report(): Promise<HealthReport> {
    const now = Date.now();
    if (!this.latest || now - this.latest.at > REPORT_TTL_MS) {
      this.latest = { at: now, report: this.run() };
    }
    return this.latest.report;
  }

  private async run(): Promise<HealthReport> {
    const checks = this.registry.all();
    const results = await Promise.all(checks.map((check) => this.one(check)));
    const byName = Object.fromEntries(
      checks.map((check, index) => [check.name, results[index]]),
    );
    const failed = results.filter((result) => result.status === 'down');
    const status: ServiceStatus =
      this.shuttingDown || failed.some((result) => result.required)
        ? 'down'
        : failed.length > 0
          ? 'degraded'
          : 'ok';
    return {
      status,
      service: this.options.service,
      ...(this.shuttingDown ? { shuttingDown: true as const } : {}),
      checks: byName,
    };
  }

  private async one(check: HealthCheck): Promise<CheckResult> {
    const required = check.required ?? true;
    const timeoutMs = check.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const started = performance.now();
    const signal = AbortSignal.timeout(timeoutMs);
    let result: CheckResult;
    try {
      const details = await Promise.race([
        check.check(signal),
        new Promise<never>((_, reject) =>
          signal.addEventListener('abort', () =>
            reject(new Error(`no answer in ${timeoutMs} ms`)),
          ),
        ),
      ]);
      result = {
        status: 'up',
        required,
        latencyMs: elapsed(started),
        ...details,
      };
    } catch (error) {
      result = {
        status: 'down',
        required,
        latencyMs: elapsed(started),
        error: error instanceof Error ? error.message : String(error),
      };
    }
    this.logChange(check.name, result);
    return result;
  }

  private logChange(name: string, result: CheckResult): void {
    const previous = this.lastStatus.get(name);
    this.lastStatus.set(name, result.status);
    if (result.status === 'down' && previous !== 'down') {
      this.logger.warn(`Health check ${name} is down: ${result.error}`);
    } else if (result.status === 'up' && previous === 'down') {
      this.logger.log(`Health check ${name} is up again`);
    }
  }

  private find<T>(token: abstract new (...args: never[]) => T): T | null {
    try {
      return this.moduleRef.get(token, { strict: false });
    } catch {
      return null;
    }
  }
}

const elapsed = (started: number): number =>
  Math.round(performance.now() - started);

/** The service's own Postgres: `SELECT 1`. Required. */
export function databaseCheck(dataSource: DataSource): HealthCheck {
  return {
    name: 'database',
    async check() {
      if (!dataSource.isInitialized) {
        throw new Error('not connected');
      }
      await dataSource.query('SELECT 1');
    },
  };
}

/**
 * RabbitMQ: whether the connection is up. Not required: events wait in the
 * outbox meanwhile, and requests are still served.
 */
export function rabbitMqCheck(amqp: AmqpConnection): HealthCheck {
  return {
    name: 'rabbitmq',
    required: false,
    check() {
      return amqp.connected
        ? Promise.resolve()
        : Promise.reject(new Error('not connected'));
    },
  };
}
