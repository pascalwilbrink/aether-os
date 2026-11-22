export interface SessionOptions {
  idleTimeoutMs: number;
  runTimeoutMs: number;
  reaperIntervalMs: number;
}

export const SESSION_OPTIONS = Symbol('SESSION_OPTIONS');
