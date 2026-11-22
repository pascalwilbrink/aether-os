import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  context,
  logs,
  ROOT_CONTEXT,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import Transport from 'winston-transport';

import { runAsPrincipal } from '../auth/request-context.js';
import type { Principal } from '../auth/principal.js';
import { runWithLogContext } from './log-context.js';
import {
  createLogger,
  createWinston,
  openTelemetryTransport,
} from './logger.js';

/** Keeps every line as the Console transport would have written it. */
class Lines extends Transport {
  readonly lines: Record<string, unknown>[] = [];
  override log(info: object, callback: () => void): void {
    this.lines.push(
      JSON.parse(JSON.stringify(info)) as Record<string, unknown>,
    );
    callback();
  }
}

const span = {
  traceId: '0af7651916cd43dd8448eb211c80319c',
  spanId: 'b7ad6b7169203331',
  traceFlags: TraceFlags.SAMPLED,
};

const principal: Principal = {
  sub: 'user-1',
  subType: 'user',
  organizationId: '11111111-1111-4111-8111-111111111111',
  organizationRoles: ['member'],
  projectRoles: {},
  projectId: null,
  taskId: null,
  taskTreeId: null,
  agentId: null,
  agentVersionId: null,
  sessionId: null,
  actor: null,
  scopes: [],
};

describe('createLogger', () => {
  const contextManager = new AsyncLocalStorageContextManager();

  beforeAll(() => {
    context.setGlobalContextManager(contextManager.enable());
  });

  afterAll(() => {
    context.disable();
  });

  function logger(env: NodeJS.ProcessEnv = {}) {
    const lines = new Lines();
    const instance = createWinston({
      service: 'test',
      env,
      envFile: null,
      transports: [lines],
    });
    return { instance, lines: lines.lines };
  }

  it('writes the service, the time, the trace and the principal on every line', () => {
    const { instance, lines } = logger();

    context.with(trace.setSpanContext(ROOT_CONTEXT, span), () =>
      runAsPrincipal(principal, () =>
        instance.info('started', { context: 'Runner' }),
      ),
    );

    expect(lines[0]).toMatchObject({
      level: 'info',
      message: 'started',
      service: 'test',
      context: 'Runner',
      traceId: span.traceId,
      spanId: span.spanId,
      organizationId: principal.organizationId,
      sub: 'user-1',
    });
    expect(lines[0]?.time).toEqual(expect.any(String));
  });

  it('adds the fields of the unit of work, before the token', () => {
    const { instance, lines } = logger();

    runWithLogContext(
      { organizationId: 'org-2', taskId: 'task-1', projectId: null },
      () =>
        runWithLogContext({ executionId: 'execution-1' }, () =>
          instance.warn('slow'),
        ),
    );

    expect(lines[0]).toMatchObject({
      organizationId: 'org-2',
      taskId: 'task-1',
      executionId: 'execution-1',
    });
    expect(lines[0]).not.toHaveProperty('projectId');
    expect(lines[0]).not.toHaveProperty('traceId');
  });

  it('redacts secrets in the message and in fields, at any depth', () => {
    const { instance, lines } = logger();

    instance.info('calling with Bearer abc.def.ghi for ann@example.com', {
      headers: { Authorization: 'Bearer x', accept: 'json' },
      url: 'postgres://aether:hunter2@localhost/db',
      nested: [
        {
          apiKey: 'sk-1234567890abcdefgh',
          note: 'ghp_aaaaaaaaaaaaaaaaaaaaaaaa',
        },
      ],
    });

    expect(lines[0]).toMatchObject({
      message: 'calling with Bearer [redacted] for [redacted email]',
      headers: { Authorization: '[redacted]', accept: 'json' },
      url: 'postgres://aether:[redacted]@localhost/db',
      nested: [{ apiKey: '[redacted]', note: '[redacted token]' }],
    });
  });

  it('logs below LOG_LEVEL not at all', () => {
    const { instance, lines } = logger({ LOG_LEVEL: 'warn' });

    instance.info('quiet');
    instance.error('loud');

    expect(lines.map((line) => line.message)).toEqual(['loud']);
  });

  it("is Nest's logger: context and stack from Logger.error", () => {
    const lines = new Lines();
    const nest = createLogger({
      service: 'test',
      env: {},
      envFile: null,
      transports: [lines],
    });

    nest.error('failed', 'Error: boom\n    at x', 'Deliveries');
    nest.log('no stack', 'Deliveries');

    expect(lines.lines[0]).toMatchObject({
      level: 'error',
      message: 'failed',
      context: 'Deliveries',
      stack: 'Error: boom\n    at x',
    });
    expect(lines.lines[1]).not.toHaveProperty('stack');
  });

  it('sends records to OpenTelemetry, linked to the active span', async () => {
    const exporter = new InMemoryLogRecordExporter();
    const provider = new LoggerProvider({
      processors: [new SimpleLogRecordProcessor({ exporter })],
    });
    logs.setGlobalLoggerProvider(provider);
    try {
      const instance = createWinston({
        service: 'test',
        env: {},
        envFile: null,
        transports: [openTelemetryTransport()],
      });

      context.with(trace.setSpanContext(ROOT_CONTEXT, span), () =>
        runWithLogContext({ taskId: 'task-1' }, () =>
          instance.info(
            'with token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig',
            {
              context: 'Runner',
            },
          ),
        ),
      );
      await provider.forceFlush();

      context.with(trace.setSpanContext(ROOT_CONTEXT, span), () =>
        createLogger({
          service: 'test',
          env: {},
          envFile: null,
          transports: [openTelemetryTransport()],
        }).error('failed', 'Error: boom\n    at x', 'Deliveries'),
      );
      await provider.forceFlush();

      const [record, failure] = exporter.getFinishedLogRecords();
      expect(record?.body).toBe('with token [redacted jwt]');
      expect(record?.severityText).toBe('info');
      expect(record?.spanContext?.traceId).toBe(span.traceId);
      expect(record?.attributes).toMatchObject({
        context: 'Runner',
        taskId: 'task-1',
      });
      expect(record?.attributes).not.toHaveProperty('time');
      expect(record?.attributes).not.toHaveProperty('traceId');
      // The stack once, as the record's exception.
      expect(failure?.attributes).toMatchObject({
        context: 'Deliveries',
        'exception.stacktrace': 'Error: boom\n    at x',
      });
      expect(failure?.attributes).not.toHaveProperty('stack');
    } finally {
      logs.disable();
      await provider.shutdown();
    }
  });
});
