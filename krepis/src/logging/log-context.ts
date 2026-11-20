import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Fields every log line in a unit of work carries (../../../docs/engineering.md,
 * Logging): set once where the work starts (a message's handling, a task's
 * execution), never by each log call.
 */
export interface LogContext {
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  executionId?: string | null;
  eventId?: string | null;
}

const storage = new AsyncLocalStorage<LogContext>();

/** Runs `fn` with `fields` added to the current log context. */
export function runWithLogContext<T>(fields: LogContext, fn: () => T): T {
  return storage.run({ ...storage.getStore(), ...withoutEmpty(fields) }, fn);
}

export function currentLogContext(): LogContext {
  return storage.getStore() ?? {};
}

function withoutEmpty(fields: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value != null && value !== ''),
  );
}
