import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import type { LoggerService } from '@nestjs/common';
import { context, isSpanContextValid, trace } from '@opentelemetry/api';
import { OpenTelemetryTransportV3 } from '@opentelemetry/winston-transport';
import { WinstonModule } from 'nest-winston';
import winston, { format, type Logform } from 'winston';
import type Transport from 'winston-transport';

import { currentPrincipal } from '../auth/request-context.js';
import { currentLogContext } from './log-context.js';
import { isSecretKey, redactValue } from './redact-log.js';

export const LOG_LEVELS = [
  'error',
  'warn',
  'info',
  'debug',
  'verbose',
] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LoggerOptions {
  /** `service` on every line (e.g. `hephaestus`). */
  service: string;
  /**
   * The environment, for `LOG_LEVEL` (`info` by default) and `LOG_FORMAT`
   * (`json`, one object per line, by default; `pretty` for reading in a
   * terminal).
   */
  env?: NodeJS.ProcessEnv;
  /**
   * A dotenv file whose `LOG_*` variables apply when the environment lacks
   * them (`.env` by default; a missing file is fine): the logger is made
   * before Nest's configuration reads `.env`.
   */
  envFile?: string | null;
  /** Instead of stdout and OpenTelemetry (tests). */
  transports?: Transport[];
}

const SPLAT = Symbol.for('splat');

/** Where OpenTelemetry's Winston transport looks for a record's context. */
const OTEL_CONTEXT = Symbol.for('opentelemetry.js.contrib.winston.context');

/**
 * The service's Nest logger (../../../docs/engineering.md, Logging), for
 * `NestFactory.create(AppModule, { logger })`: Winston, through
 * `nest-winston`, so every `Logger` in the service writes through it.
 *
 * Every line carries `level`, `time`, `service`, the Nest `context` (the
 * class), `traceId` / `spanId` of the active span, and when known the
 * `organizationId`, `projectId`, `taskId` and the principal's `sub` (from
 * the request's token, or `runWithLogContext`). Secrets are redacted:
 * values under secret-looking keys (`authorization`, `token`, `password`,
 * `email`, …) and secret-looking text anywhere (bearer tokens, JWTs,
 * provider keys, GitHub tokens, email addresses, credentials in URLs).
 *
 * Lines go to stdout, and to OpenTelemetry's logs API: once
 * `startTelemetry` has run, that exports them over OTLP to the Collector
 * (and on to Loki), each linked to its trace; otherwise it drops them.
 */
export function createLogger(options: LoggerOptions): LoggerService {
  return WinstonModule.createLogger({ instance: createWinston(options) });
}

/** The Winston logger behind `createLogger` (tests). */
export function createWinston(options: LoggerOptions): winston.Logger {
  const env = options.env ?? process.env;
  if (options.envFile !== null) {
    applyLogVariables(env, options.envFile ?? '.env');
  }
  const level = LOG_LEVELS.includes(env.LOG_LEVEL as LogLevel)
    ? (env.LOG_LEVEL as LogLevel)
    : 'info';
  const pretty = env.LOG_FORMAT === 'pretty';

  return winston.createLogger({
    level,
    format: format.combine(
      withContext(options.service)(),
      redacted(),
      stamped(),
    ),
    transports: options.transports ?? [
      new winston.transports.Console({
        format: pretty ? prettyLine() : format.json(),
      }),
      openTelemetryTransport(),
    ],
  });
}

/** `time`, as an ISO 8601 timestamp. */
const stamped = format((info) => {
  info.time = new Date().toISOString();
  return info;
});

/**
 * The transport to OpenTelemetry's logs API (exported over OTLP once
 * `startTelemetry` has run, dropped otherwise).
 */
export function openTelemetryTransport(): Transport {
  return new OpenTelemetryTransportV3({ format: forOpenTelemetry() });
}

/** The service, the trace and the unit of work's fields. */
function withContext(service: string) {
  return format((info) => {
    const active = context.active();
    const span = trace.getSpanContext(active);
    const principal = currentPrincipal();
    const fields = currentLogContext();
    const add: Record<string, string> = { service };
    if (span && isSpanContextValid(span)) {
      add.traceId = span.traceId;
      add.spanId = span.spanId;
    }
    const organizationId =
      fields.organizationId ?? principal?.organizationId ?? null;
    const projectId = fields.projectId ?? principal?.projectId ?? null;
    const taskId = fields.taskId ?? principal?.taskId ?? null;
    if (organizationId) add.organizationId = organizationId;
    if (projectId) add.projectId = projectId;
    if (taskId) add.taskId = taskId;
    if (fields.executionId) add.executionId = fields.executionId;
    if (fields.eventId) add.eventId = fields.eventId;
    if (principal) add.sub = principal.sub;
    Object.assign(info, add);
    // So the OpenTelemetry transport links the record to the span that was
    // active when it was logged.
    (info as unknown as Record<symbol, unknown>)[OTEL_CONTEXT] = active;
    return info;
  });
}

/** The message and every field, cleaned of secrets; Nest's `stack` as text. */
const redacted = format((info) => {
  for (const key of Object.keys(info)) {
    if (key === 'level') {
      continue;
    }
    let value: unknown = info[key];
    if (key === 'stack' && Array.isArray(value)) {
      // nest-winston passes `[trace]`, or `[undefined]` without one.
      value = value.filter((line) => line != null).join('\n') || undefined;
    }
    if (value === undefined) {
      delete info[key];
    } else {
      info[key] = isSecretKey(key) ? '[redacted]' : redactValue(value);
    }
  }
  return info;
});

/**
 * For OTLP: the body is the message; the service is the resource's
 * `service.name` and the trace is the record's own, so neither repeats as
 * an attribute.
 */
const forOpenTelemetry = format((info) => {
  // The transport gets its own copy of the record (winston-transport).
  const record = info as unknown as Record<string | symbol, unknown>;
  for (const key of ['time', 'service', 'traceId', 'spanId']) {
    delete record[key];
  }
  // Winston's raw arguments (Nest's `{ context, stack: [trace] }`), which
  // the transport would otherwise take for the exception: it's `stack`.
  delete record[SPLAT];
  return info;
});

/** `12:00:00.000 info  hephaestus TaskRunner  message {fields}` */
function prettyLine(): Logform.Format {
  return format.combine(
    format.colorize({ level: true }),
    format.printf((info) => {
      const {
        level,
        message,
        time,
        service,
        context: nestContext,
        stack,
        ...fields
      } = info as Logform.TransformableInfo & Record<string, unknown>;
      const clock = typeof time === 'string' ? time.slice(11, 23) : '';
      const extra = Object.keys(fields).length
        ? ` ${JSON.stringify(fields)}`
        : '';
      const where = typeof nestContext === 'string' ? ` ${nestContext}` : '';
      const trail = typeof stack === 'string' ? `\n${stack}` : '';
      return `${clock} ${level} ${String(service)}${where}  ${String(message)}${extra}${trail}`;
    }),
  );
}

/** The file's `LOG_*` variables, where the environment doesn't set them. */
function applyLogVariables(env: NodeJS.ProcessEnv, file: string): void {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const [name, value] of Object.entries(parseEnv(text))) {
    if (name.startsWith('LOG_') && env[name] === undefined) {
      env[name] = value;
    }
  }
}
