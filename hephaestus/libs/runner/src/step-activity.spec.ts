import {
  ExecutionActivity,
  type NewExecutionEvent,
} from './execution-activity.js';
import { recordStep, toolCallsOf } from './step-activity.js';

describe('recordStep', () => {
  it('records the model call, then each tool call with what came back', async () => {
    const kept: NewExecutionEvent[] = [];
    const activity = new ExecutionActivity('execution-1', (_id, event) => {
      kept.push(event);
      return Promise.resolve();
    });
    // As Mastra reports a step: AI SDK content parts.
    recordStep(activity, {
      finishReason: 'tool-calls',
      usage: { inputTokens: 120, outputTokens: 30 },
      content: [
        { type: 'text', text: 'Let me look.' },
        {
          type: 'tool-call',
          toolCallId: 'a',
          toolName: 'execute_command',
          input: { command: 'ls' },
        },
        {
          type: 'tool-result',
          toolCallId: 'a',
          toolName: 'execute_command',
          output: { type: 'text', value: 'index.html\n' },
        },
        {
          type: 'tool-call',
          toolCallId: 'b',
          toolName: 'submit_file',
          input: { path: 'gone.html' },
        },
        {
          type: 'tool-result',
          toolCallId: 'b',
          toolName: 'submit_file',
          output: {
            type: 'error-text',
            value: '/workspace/gone.html is not a file in your sandbox.',
          },
        },
      ],
    });
    await activity.flush();
    expect(kept).toEqual([
      expect.objectContaining({
        type: 'model_call',
        level: 'info',
        message: 'Model call (120 in, 30 out): tool-calls',
        text: 'Let me look.',
        inputTokens: 120,
        outputTokens: 30,
      }),
      expect.objectContaining({
        type: 'tool_call',
        level: 'info',
        message: 'execute_command',
        toolName: 'execute_command',
        input: '{"command":"ls"}',
        output: 'index.html\n',
      }),
      expect.objectContaining({
        type: 'tool_call',
        level: 'warn',
        message: 'submit_file failed',
        output: '/workspace/gone.html is not a file in your sandbox.',
      }),
    ]);
  });

  it("reads Mastra's own tool chunks when there's no content", () => {
    expect(
      toolCallsOf({
        toolCalls: [
          { payload: { toolCallId: 'c', toolName: 'x', args: { a: 1 } } },
        ],
        toolResults: [
          { payload: { toolCallId: 'c', result: 'ok', isError: false } },
        ],
      }),
    ).toEqual([
      { toolName: 'x', input: { a: 1 }, output: 'ok', isError: false },
    ]);
  });

  it("keeps going when the log can't be written, and stops at its limit", async () => {
    let writes = 0;
    const failing = new ExecutionActivity('execution-2', () => {
      writes++;
      return Promise.reject(new Error('database down'));
    });
    failing.log('one');
    failing.log('two');
    await expect(failing.flush()).resolves.toBeUndefined();
    expect(writes).toBe(2);

    const kept: NewExecutionEvent[] = [];
    const full = new ExecutionActivity('execution-3', (_id, event) => {
      kept.push(event);
      return Promise.resolve();
    });
    for (let i = 0; i < 2100; i++) full.log(`event ${i}`);
    await full.flush();
    expect(kept).toHaveLength(2001);
    expect(kept.at(-1)).toMatchObject({
      level: 'warn',
      message: 'More happened; only the first 2000 events are kept.',
    });
  });
});
