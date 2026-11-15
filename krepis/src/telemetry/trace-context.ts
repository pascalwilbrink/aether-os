import { AsyncLocalStorage } from 'node:async_hooks';

import { context, trace, TraceFlags } from '@opentelemetry/api';

/** W3C Trace Context headers (`traceparent`, optionally `tracestate`). */
export interface TraceContextHeaders {
  traceparent: string;
  tracestate?: string;
}

/** Request or message headers; only `traceparent` and `tracestate` are read. */
export type TraceHeadersInput = Readonly<
  Record<string, string | string[] | undefined>
>;

const TRACEPARENT = /^([\da-f]{2})-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/;
const incoming = new AsyncLocalStorage<TraceContextHeaders>();

/** A valid `traceparent` (and its `tracestate`), or null. */
export function parseTraceContext(
  headers: TraceHeadersInput,
): TraceContextHeaders | null {
  const traceparent = first(headers['traceparent'])?.trim().toLowerCase();
  const match = traceparent ? TRACEPARENT.exec(traceparent) : null;
  if (
    !traceparent ||
    !match ||
    match[1] === 'ff' ||
    /^0+$/.test(match[2]) ||
    /^0+$/.test(match[3])
  ) {
    return null;
  }
  const tracestate = first(headers['tracestate'])?.trim();

  return tracestate ? { traceparent, tracestate } : { traceparent };
}

/**
 * Runs `fn` with the trace context of an incoming request or message, so
 * `currentTraceContext()` finds it while no OpenTelemetry SDK is running.
 * `configureHttpApp` does this for every HTTP request.
 */
export function runWithTraceContext<T>(
  headers: TraceHeadersInput,
  fn: () => T,
): T {
  const parsed = parseTraceContext(headers);

  return parsed ? incoming.run(parsed, fn) : fn();
}

/**
 * The trace context to pass on (docs/events.md, Trace context): the current
 * OpenTelemetry span when an SDK is running, otherwise the trace context the
 * current request arrived with. Null outside any trace.
 */
export function currentTraceContext(): TraceContextHeaders | null {
  const span = trace.getSpan(context.active());
  const spanContext = span?.spanContext();
  if (spanContext && trace.isSpanContextValid(spanContext)) {
    const flags = (spanContext.traceFlags & TraceFlags.SAMPLED)
      .toString(16)
      .padStart(2, '0');
    const traceparent = `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`;
    const tracestate = spanContext.traceState?.serialize();

    return tracestate ? { traceparent, tracestate } : { traceparent };
  }

  return incoming.getStore() ?? null;
}

/** The trace ID of a `traceparent`. */
export function traceIdOf(headers: TraceContextHeaders): string {
  return headers.traceparent.split('-')[1];
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
