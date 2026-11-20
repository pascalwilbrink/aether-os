import type { ExecutionActivity } from './execution-activity.js';

/** A part of a step's content (the AI SDK's: text, tool calls, their results). */
interface ContentPart {
  type?: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
}

/** Mastra's own record of a tool call or result (`{ payload }`). */
interface MastraToolChunk {
  payload?: {
    toolCallId?: string;
    toolName?: string;
    args?: unknown;
    result?: unknown;
    isError?: boolean;
  };
}

/** What Mastra reports of one step (loosely: only what's read here). */
export interface ReportedStep {
  text?: string;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  content?: ContentPart[];
  toolCalls?: MastraToolChunk[];
  toolResults?: MastraToolChunk[];
}

interface ToolCall {
  toolName: string;
  input: unknown;
  output: unknown;
  isError: boolean;
}

/**
 * One step of the agent into its activity log (docs/tasks.md, Activity):
 * the model call (its tokens and text), then each tool it called with the
 * input and what came back, or the error.
 */
export function recordStep(
  activity: ExecutionActivity,
  step: ReportedStep,
): void {
  activity.modelCall({
    text: textOf(step),
    inputTokens: step.usage?.inputTokens ?? null,
    outputTokens: step.usage?.outputTokens ?? null,
    finishReason: step.finishReason,
  });
  for (const call of toolCallsOf(step)) {
    activity.toolCall(call);
  }
}

function textOf(step: ReportedStep): string | undefined {
  if (step.text) {
    return step.text;
  }
  const parts = (step.content ?? [])
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text);
  return parts.length > 0 ? parts.join('') : undefined;
}

/**
 * The step's tool calls with their results: from its content (the AI SDK's
 * parts: a result's `output` is `{ type, value }`, errors `error-text` /
 * `error-json`, or a `tool-error` part), else from Mastra's own chunks.
 */
export function toolCallsOf(step: ReportedStep): ToolCall[] {
  const content = step.content ?? [];
  if (content.some((part) => part.type === 'tool-call')) {
    const outcomes = new Map<string, { output: unknown; isError: boolean }>();
    for (const part of content) {
      if (!part.toolCallId) continue;
      if (part.type === 'tool-result') {
        const output = part.output as
          { type?: string; value?: unknown } | undefined;
        const typed = output && typeof output === 'object' && 'type' in output;
        outcomes.set(part.toolCallId, {
          output: typed ? output.value : part.output,
          isError: typed ? String(output.type).startsWith('error') : false,
        });
      } else if (part.type === 'tool-error') {
        outcomes.set(part.toolCallId, {
          output: errorText(part.error),
          isError: true,
        });
      }
    }
    return content
      .filter((part) => part.type === 'tool-call')
      .map((part) => ({
        toolName: part.toolName ?? 'tool',
        input: part.input,
        output: outcomes.get(part.toolCallId ?? '')?.output,
        isError: outcomes.get(part.toolCallId ?? '')?.isError ?? false,
      }));
  }
  const results = new Map(
    (step.toolResults ?? []).map((chunk) => [
      chunk.payload?.toolCallId ?? '',
      chunk.payload,
    ]),
  );
  return (step.toolCalls ?? []).map((chunk) => {
    const result = results.get(chunk.payload?.toolCallId ?? '');
    return {
      toolName: chunk.payload?.toolName ?? 'tool',
      input: chunk.payload?.args,
      output: result?.result,
      isError: Boolean(result?.isError),
    };
  });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
