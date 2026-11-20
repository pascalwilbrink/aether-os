import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { parseEnv } from 'node:util';

import type { Span } from '@opentelemetry/api';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import {
  ExpressInstrumentation,
  ExpressLayerType,
} from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import {
  BatchLogRecordProcessor,
  type LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace';

import { redactUrl } from './redact.js';

export interface TelemetryOptions {
  /** `service.name` on every span (e.g. `hephaestus`). */
  serviceName: string;
  /**
   * The environment, for the OTLP settings (`OTEL_EXPORTER_OTLP_ENDPOINT`,
   * `OTEL_SDK_DISABLED`, the SDK's other `OTEL_*` variables).
   */
  env?: NodeJS.ProcessEnv;
  /** Instead of OTLP (tests). */
  exporter?: SpanExporter;
  /** Instead of the batch processor (tests: a simple one, to see spans at once). */
  spanProcessors?: SpanProcessor[];
  /**
   * Instead of exporting log records over OTLP (tests: a simple processor
   * with an in-memory exporter). Krepis's logger (`createLogger`) writes
   * every line to OpenTelemetry's logs API, which these receive.
   */
  logRecordProcessors?: LogRecordProcessor[];
  /** Skip registering the ESM loader hook (tests that already loaded everything). */
  registerHook?: boolean;
  /**
   * A dotenv file whose `OTEL_*` variables apply when the environment lacks
   * them (`.env` by default; a missing file is fine): the service's own
   * configuration reads `.env` only once Nest boots, after this.
   */
  envFile?: string | null;
}

/** What `startTelemetry` started; `shutdown` flushes and stops it. */
export interface Telemetry {
  readonly enabled: boolean;
  shutdown(): Promise<void>;
}

let started: Telemetry | undefined;

/**
 * Starts OpenTelemetry for a service (../CLAUDE.md, Observability): spans
 * for incoming and outgoing HTTP (Node's `http` and `fetch`), Express and
 * Nest's handlers, and Postgres queries, and the service's log lines
 * (Krepis's `createLogger`), exported over OTLP (protobuf over HTTP) to
 * `OTEL_EXPORTER_OTLP_ENDPOINT` (the Collector), which sends traces to
 * Jaeger and logs to Loki. `OTEL_LOGS_EXPORTER=none` keeps logs on stdout
 * only. Without that
 * variable, or with `OTEL_SDK_DISABLED=true`, nothing starts and nothing
 * changes.
 *
 * Call it, and await it, before importing anything it should trace: the
 * service's `main.ts` starts it and then imports the app dynamically. It
 * registers OpenTelemetry's ESM loader hook (`import-in-the-middle`), so
 * modules imported afterwards are patched.
 *
 * Never in a span: query values (redacted), request or response bodies and
 * headers, or Postgres parameters. Health checks aren't traced, nor queries
 * and outgoing calls outside any trace (pollers). On `SIGTERM` / `SIGINT`
 * the spans and log records waiting in their batches are flushed (for at
 * most 2 s) before the process ends as it would have.
 */
export async function startTelemetry(
  options: TelemetryOptions,
): Promise<Telemetry> {
  if (started) {
    return started;
  }
  const env = options.env ?? process.env;
  if (options.envFile !== null) {
    applyOtelVariables(env, options.envFile ?? '.env');
  }
  const endpoint =
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (
    env.OTEL_SDK_DISABLED === 'true' ||
    (!endpoint && !options.exporter && !options.spanProcessors)
  ) {
    started = { enabled: false, shutdown: () => Promise.resolve() };
    return started;
  }
  if (options.registerHook !== false) {
    register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
  }
  // Traces and logs; no metrics for now.
  env.OTEL_METRICS_EXPORTER ??= 'none';
  const logRecordProcessors =
    options.logRecordProcessors ??
    (env.OTEL_LOGS_EXPORTER === 'none'
      ? []
      : [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })]);

  const sdk = new NodeSDK({
    serviceName: options.serviceName,
    ...(options.spanProcessors
      ? { spanProcessors: options.spanProcessors }
      : { traceExporter: options.exporter ?? new OTLPTraceExporter() }),
    logRecordProcessors,
    instrumentations: instrumentations(),
  });
  sdk.start();

  const shutdown = async () => {
    await Promise.race([
      sdk.shutdown().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 2000).unref()),
    ]);
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void shutdown().finally(() => process.kill(process.pid, signal));
    });
  }
  started = { enabled: true, shutdown };
  return started;
}

/** The file's `OTEL_*` variables, where the environment doesn't set them. */
function applyOtelVariables(env: NodeJS.ProcessEnv, file: string): void {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const [name, value] of Object.entries(parseEnv(text))) {
    if (name.startsWith('OTEL_') && env[name] === undefined) {
      env[name] = value;
    }
  }
}

function instrumentations(): Instrumentation[] {
  const redact = (span: Span, url: string | undefined) => {
    if (url?.includes('?')) {
      span.setAttribute('url.full', redactUrl(url));
    }
  };
  return [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (request) =>
        /^\/health(\/|\?|$)/.test(request.url ?? ''),
      requestHook: (span, request) => {
        if ('url' in request && typeof request.url === 'string') {
          // Incoming: the path and query, as http.target and url.query.
          span.setAttribute('http.target', redactUrl(request.url));
          const query = request.url.split('?')[1];
          if (query !== undefined) {
            span.setAttribute('url.query', redactUrl(`?${query}`).slice(1));
          }
        } else if ('path' in request && typeof request.path === 'string') {
          span.setAttribute('http.target', redactUrl(request.path));
        }
      },
    }),
    new UndiciInstrumentation({
      // Calls outside any trace (a poller's) would each start one of their own.
      requireParentforSpans: true,
      requestHook: (span, request) => {
        redact(span, `${request.origin}${request.path}`);
      },
    }),
    // The route's handler; not every middleware (body parsers, guards' glue).
    new ExpressInstrumentation({
      ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
    }),
    new NestInstrumentation(),
    // Statements only: their parameters (values) are never recorded. Only
    // within a trace: the outbox relay's and runners' polls would otherwise
    // each be a trace of their own, every second.
    new PgInstrumentation({
      enhancedDatabaseReporting: false,
      requireParentSpan: true,
    }),
  ];
}
