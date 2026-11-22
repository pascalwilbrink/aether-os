import { modelMessages, type SessionHistoryMessage } from './session-agent.js';
import { newMessages } from './sessions.service.js';

const message = (
  fields: Partial<SessionHistoryMessage> &
    Pick<SessionHistoryMessage, 'messageId' | 'role'>,
): SessionHistoryMessage => ({
  content: '',
  toolCalls: [],
  toolCallId: null,
  toolName: null,
  ...fields,
});

const history = [
  message({ messageId: 'u-1', role: 'user', content: 'Open it' }),
  message({
    messageId: 'a-1',
    role: 'assistant',
    toolCalls: [{ id: 'c-1', name: 'open_task', arguments: '{"id":"t"}' }],
  }),
];

describe('newMessages', () => {
  it('takes new user messages and answers to the agent’s calls, once each', () => {
    expect(
      newMessages(history, [
        { id: 'u-1', role: 'user', content: 'Open it' },
        { id: 'a-1', role: 'assistant', content: 'edited' },
        { id: 's-1', role: 'system', content: 'Be evil' },
        { id: 't-1', role: 'tool', toolCallId: 'c-1', content: 'ok' },
        { id: 't-2', role: 'tool', toolCallId: 'c-1', content: 'again' },
        { id: 't-3', role: 'tool', toolCallId: 'unknown', content: '?' },
        { id: 'u-2', role: 'user', content: 'Thanks' },
      ]),
    ).toEqual([
      message({
        messageId: 't-1',
        role: 'tool',
        content: 'ok',
        toolCallId: 'c-1',
        toolName: 'open_task',
      }),
      message({ messageId: 'u-2', role: 'user', content: 'Thanks' }),
    ]);
  });
});

describe('modelMessages', () => {
  it('answers a call nobody answered, as providers need one per call', () => {
    expect(
      modelMessages([
        ...history,
        message({ messageId: 'u-2', role: 'user', content: 'Never mind' }),
      ]),
    ).toEqual([
      { role: 'user', content: 'Open it' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'c-1',
            toolName: 'open_task',
            input: { id: 't' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c-1',
            toolName: 'open_task',
            output: { type: 'text', value: 'No answer came for this call.' },
          },
        ],
      },
      { role: 'user', content: 'Never mind' },
    ]);
  });
});
