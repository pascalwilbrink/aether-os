import { context, trace, TraceFlags } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { TraceState } from '@opentelemetry/core';

import {
  currentTraceContext,
  parseTraceContext,
  runWithTraceContext,
  traceIdOf,
} from './trace-context.js';

const TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

describe('trace context', () => {
  it('parses valid W3C trace context headers only', () => {
    expect(
      parseTraceContext({ traceparent: TRACEPARENT, tracestate: 'a=1' }),
    ).toEqual({
      traceparent: TRACEPARENT,
      tracestate: 'a=1',
    });
    expect(parseTraceContext({ traceparent: [TRACEPARENT] })).toEqual({
      traceparent: TRACEPARENT,
    });
    for (const traceparent of [
      undefined,
      'nonsense',
      '00-00000000000000000000000000000000-00f067aa0ba902b7-01',
      '00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01',
      'ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    ]) {
      expect(parseTraceContext({ traceparent })).toBeNull();
    }
  });

  it('keeps the incoming trace context while handling a request', async () => {
    expect(currentTraceContext()).toBeNull();

    const seen = await runWithTraceContext(
      { traceparent: TRACEPARENT },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return currentTraceContext();
      },
    );

    expect(seen).toEqual({ traceparent: TRACEPARENT });
    expect(traceIdOf(seen!)).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(currentTraceContext()).toBeNull();
    expect(runWithTraceContext({}, () => currentTraceContext())).toBeNull();
  });

  describe('with OpenTelemetry', () => {
    const manager = new AsyncLocalStorageContextManager();

    beforeAll(() => {
      context.setGlobalContextManager(manager.enable());
    });

    afterAll(() => {
      manager.disable();
      context.disable();
    });

    it('passes on the current span, not the incoming context', () => {
      const span = trace.wrapSpanContext({
        traceId: '0af7651916cd43dd8448eb211c80319c',
        spanId: 'b7ad6b7169203331',
        traceFlags: TraceFlags.SAMPLED,
        traceState: new TraceState('vendor=x'),
      });

      const seen = runWithTraceContext({ traceparent: TRACEPARENT }, () =>
        context.with(trace.setSpan(context.active(), span), () =>
          currentTraceContext(),
        ),
      );

      expect(seen).toEqual({
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        tracestate: 'vendor=x',
      });
    });
  });
});
