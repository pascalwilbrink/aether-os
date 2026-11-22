/**
 * The AG-UI events a session's run streams (docs.ag-ui.com, Events), as
 * plain objects: the frontend (CopilotKit) reads them from server-sent
 * events. Only what Hephaestus sends.
 */
export type AguiEvent =
  | { type: 'RUN_STARTED'; threadId: string; runId: string }
  | { type: 'RUN_FINISHED'; threadId: string; runId: string }
  | { type: 'RUN_ERROR'; message: string; code: string }
  | { type: 'TEXT_MESSAGE_START'; messageId: string; role: 'assistant' }
  | { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'TEXT_MESSAGE_END'; messageId: string }
  | {
      type: 'TOOL_CALL_START';
      toolCallId: string;
      toolCallName: string;
      parentMessageId: string;
    }
  | { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string }
  | { type: 'TOOL_CALL_END'; toolCallId: string }
  | {
      type: 'TOOL_CALL_RESULT';
      messageId: string;
      toolCallId: string;
      content: string;
      role: 'tool';
    };

/** One event as a server-sent event. */
export function sse(event: AguiEvent): string {
  return `data: ${JSON.stringify({ ...event, timestamp: Date.now() })}\n\n`;
}
