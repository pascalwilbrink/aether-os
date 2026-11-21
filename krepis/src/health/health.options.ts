import type { HealthCheck } from './health-check.js';

export const HEALTH_OPTIONS = Symbol('HEALTH_OPTIONS');

export interface HealthOptions {
  /** The service's name, in every report. */
  service: string;
  /**
   * Checks besides the database and RabbitMQ (found by themselves): the
   * services and servers it calls, from its configuration.
   */
  checks: HealthCheck[];
}
