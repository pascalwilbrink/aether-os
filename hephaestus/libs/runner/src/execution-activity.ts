import { Logger } from '@nestjs/common';

import { excerpt, shorten } from './activity-text.js';
import type {
  ExecutionEventEntity,
  ExecutionEventLevel,
} from './execution-event.entity.js';

/** Events one execution keeps; past this, one warning and nothing more. */
export const MAX_EVENTS_PER_EXECUTION = 2000;

export type NewExecutionEvent = Omit<
  ExecutionEventEntity,
  'id' | 'executionId' | 'sequence' | 'createdAt'
>;

/** Where the events go (the table, numbering them; or memory in tests). */
export type ExecutionEventWriter = (
  executionId: string,
  event: NewExecutionEvent,
) => Promise<void>;

/**
 * An execution's activity log (docs/tasks.md, Activity), as the runner and
 * the agent runtime record it: events written one after another, in the
 * order they're recorded (the table numbers them). Recording never throws and never
 * waits on the database: insight into a run must never fail it.
 */
export class ExecutionActivity {
  private readonly logger = new Logger(ExecutionActivity.name);
  private recorded = 0;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    readonly executionId: string,
    private readonly write: ExecutionEventWriter,
  ) {}

  log(message: string, level: ExecutionEventLevel = 'info'): void {
    this.record({
      type: 'log',
      level,
      message: shorten(message, 1000),
      toolName: null,
      input: null,
      output: null,
      text: null,
      inputTokens: null,
      outputTokens: null,
    });
  }

  modelCall(call: {
    text?: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    finishReason?: string;
  }): void {
    const tokens =
      call.inputTokens != null || call.outputTokens != null
        ? ` (${call.inputTokens ?? 0} in, ${call.outputTokens ?? 0} out)`
        : '';
    this.record({
      type: 'model_call',
      level: call.finishReason === 'error' ? 'error' : 'info',
      message: `Model call${tokens}${call.finishReason ? `: ${call.finishReason}` : ''}`,
      toolName: null,
      input: null,
      output: null,
      text: call.text ? excerpt(call.text) : null,
      inputTokens: call.inputTokens ?? null,
      outputTokens: call.outputTokens ?? null,
    });
  }

  toolCall(call: {
    toolName: string;
    input?: unknown;
    output?: unknown;
    isError?: boolean;
  }): void {
    this.record({
      type: 'tool_call',
      level: call.isError ? 'warn' : 'info',
      message: `${call.toolName}${call.isError ? ' failed' : ''}`,
      toolName: call.toolName,
      input: excerpt(call.input),
      output: excerpt(call.output),
      text: null,
      inputTokens: null,
      outputTokens: null,
    });
  }

  /** Waits for what was recorded so far to be written (tests, the end of a run). */
  flush(): Promise<void> {
    return this.writing;
  }

  private record(event: NewExecutionEvent): void {
    if (this.recorded > MAX_EVENTS_PER_EXECUTION) {
      return;
    }
    const count = ++this.recorded;
    const kept: NewExecutionEvent =
      count > MAX_EVENTS_PER_EXECUTION
        ? {
            ...event,
            type: 'log',
            level: 'warn',
            message: `More happened; only the first ${MAX_EVENTS_PER_EXECUTION} events are kept.`,
            toolName: null,
            input: null,
            output: null,
            text: null,
            inputTokens: null,
            outputTokens: null,
          }
        : event;
    this.writing = this.writing
      .then(() => this.write(this.executionId, kept))
      .catch((error: unknown) => {
        this.logger.warn(
          `An event of execution ${this.executionId} could not be kept: ${String(error)}`,
        );
      });
  }
}

/** An activity log that keeps nothing (runs without an execution, tests). */
export const NO_ACTIVITY = new ExecutionActivity('none', () =>
  Promise.resolve(),
);
