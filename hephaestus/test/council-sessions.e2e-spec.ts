import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';

import { createAgent, publishedAgent, publishedCouncil } from './agora.js';
import { createApp } from './app.js';
import { asMember, type Client } from './auth.js';
import type { ScriptedPylonModels } from './fake-models.js';
import type { FakePolis } from './fake-polis.js';
import type { FakeSessionTokens } from './fake-session-tokens.js';

interface AguiEvent {
  type: string;
  [key: string]: unknown;
}

const sseText = (
  response: request.Response,
  callback: (error: Error | null, body: string) => void,
) => {
  const stream = response as unknown as NodeJS.ReadableStream;
  let body = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => (body += chunk));
  stream.on('end', () => callback(null, body));
};

const eventsOf = (body: string): AguiEvent[] =>
  body
    .split('\n\n')
    .filter((frame) => frame.startsWith('data: '))
    .map((frame) => JSON.parse(frame.slice('data: '.length)) as AguiEvent);

/** The events without the text chunks, for comparing orders. */
const shape = (events: AguiEvent[]) =>
  events
    .filter((event) => event.type !== 'TEXT_MESSAGE_CONTENT')
    .map((event) =>
      event.type === 'CUSTOM'
        ? `author:${(event.value as { author: { kind: string } }).author.kind}`
        : event.type,
    );

describe('Council sessions (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let models: ScriptedPylonModels;
  let sessionTokens: FakeSessionTokens;
  let orgId: string;
  let projectId: string;
  let facilitatorId: string;
  let architectId: string;
  let securityId: string;
  let person: Client;
  let base: string;

  beforeEach(async () => {
    ({ app, polis, models, sessionTokens } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    ({ agentId: facilitatorId } = await publishedAgent(app, orgId, {
      name: 'Facilitator',
      instructions: 'You facilitate.',
    }));
    ({ agentId: architectId } = await publishedAgent(app, orgId, {
      name: 'Architect',
      instructions: 'You design systems.',
    }));
    ({ agentId: securityId } = await publishedAgent(app, orgId, {
      name: 'Security',
      instructions: 'You review security.',
    }));
    person = await asMember(app, orgId, ['member'], { [projectId]: 'viewer' });
    base = `/v1/organizations/${orgId}/projects/${projectId}/sessions`;
  });

  afterEach(async () => {
    await app.close();
  });

  const council = (allowDirectInteraction = true) =>
    publishedCouncil(app, orgId, {
      facilitatorId,
      allowDirectInteraction,
      members: [
        { agentId: architectId, participation: 'required', role: 'design' },
        {
          agentId: securityId,
          participation: 'conditional',
          when: 'Anything touching authentication',
        },
      ],
    });

  const start = async (councilId: string) =>
    (await person.post(base).send({ councilId }).expect(201)).body as {
      id: string;
      members: { agentId: string; invited: boolean }[];
    };

  let runs = 0;
  const run = async (
    sessionId: string,
    content: string,
    forwardedProps?: Record<string, unknown>,
  ): Promise<AguiEvent[]> => {
    const response = await person
      .post(`${base}/${sessionId}/runs`)
      .send({
        threadId: sessionId,
        runId: `run-${++runs}`,
        messages: [{ id: `m-${runs}`, role: 'user', content }],
        ...(forwardedProps ? { forwardedProps } : {}),
      })
      .buffer(true)
      .parse(sseText)
      .expect(200);
    return eventsOf(response.body as string);
  };

  const messages = async (sessionId: string) =>
    (await person.get(`${base}/${sessionId}/messages`).expect(200)).body
      .items as {
      role: string;
      content: string;
      author: { kind: string; agentId: string | null };
      toolCalls: { name: string }[];
    }[];

  it('pins the council, its facilitator and members when a session starts', async () => {
    const { councilId, versionId } = await council();
    const session = (await person.post(base).send({ councilId }).expect(201))
      .body as Record<string, unknown>;
    expect(session).toMatchObject({
      agentId: facilitatorId,
      councilId,
      councilVersionId: versionId,
      members: [
        expect.objectContaining({
          agentId: architectId,
          name: 'Architect',
          participation: 'required',
          role: 'design',
          invited: true,
        }),
        expect.objectContaining({
          agentId: securityId,
          name: 'Security',
          participation: 'conditional',
          when: 'Anything touching authentication',
          invited: false,
        }),
      ],
    });
    const [started] = (
      (await app
        .get(DataSource)
        .query(
          `SELECT message->'payload' AS payload FROM outbox WHERE routing_key = 'session.started'`,
        )) as { payload: Record<string, unknown> }[]
    ).map((row) => row.payload);
    expect(started).toMatchObject({ councilId, councilVersionId: versionId });

    await person
      .post(base)
      .send({ councilId, agentId: facilitatorId })
      .expect(400);
    await person.post(base).send({}).expect(400);

    // A member without a published version: no session.
    const unpublished = await createAgent(app, orgId, { name: 'Draft' });
    const { councilId: broken } = await publishedCouncil(app, orgId, {
      facilitatorId,
      members: [{ agentId: unpublished, participation: 'required' }],
    });
    const refused = await person
      .post(base)
      .send({ councilId: broken })
      .expect(409);
    expect(refused.body.code).toBe('AGENT_NOT_PUBLISHED');
  });

  it('lets the facilitator ask a member, who answers in the conversation', async () => {
    const { councilId } = await council();
    const session = await start(councilId);
    models.replies = [
      {
        toolCall: {
          tool: 'ask_member',
          input: { agentId: architectId, question: 'Which database?' },
        },
      },
      { text: 'Postgres, for its JSON.' },
      { text: 'The architect suggests Postgres.' },
    ];
    const events = await run(session.id, 'What should we store this in?');
    expect(shape(events)).toEqual([
      'RUN_STARTED',
      'author:facilitator',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'author:member',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_END',
      'TOOL_CALL_RESULT',
      'author:facilitator',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
    const result = events.find((event) => event.type === 'TOOL_CALL_RESULT');
    expect(JSON.parse(result?.content as string)).toEqual({
      member: 'Architect',
      answer: 'Postgres, for its JSON.',
    });

    // Each agent with its own instructions and its own session token.
    expect(JSON.stringify(models.calls[0].prompt)).toContain('You facilitate.');
    expect(JSON.stringify(models.calls[0].prompt)).toContain('Architect');
    expect(JSON.stringify(models.calls[1].prompt)).toContain(
      'You design systems.',
    );
    expect(JSON.stringify(models.calls[1].prompt)).toContain(
      'Person: What should we store this in?',
    );
    expect(sessionTokens.requests.map((token) => token.agentId).sort()).toEqual(
      [facilitatorId, architectId].sort(),
    );

    expect(
      (await messages(session.id)).map((message) => [
        message.role,
        message.author.kind,
      ]),
    ).toEqual([
      ['user', 'user'],
      ['assistant', 'facilitator'],
      ['assistant', 'member'],
      ['tool', 'facilitator'],
      ['assistant', 'facilitator'],
    ]);

    // The next turn: the member's answer is in the call's result, not twice.
    models.replies = [{ text: 'Anything else?' }];
    await run(session.id, 'Thanks.');
    const prompt = JSON.stringify(models.calls.at(-1)?.prompt);
    expect(prompt.match(/Postgres, for its JSON\./g)).toHaveLength(1);
  });

  it('asks only members taking part: a conditional one is invited first', async () => {
    const { councilId } = await council();
    const session = await start(councilId);
    models.replies = [
      {
        toolCall: {
          tool: 'ask_member',
          input: { agentId: securityId, question: 'Is the login safe?' },
        },
      },
      {
        toolCall: {
          tool: 'invite_members',
          input: { agentIds: [securityId], reason: 'It touches login.' },
        },
      },
      {
        toolCall: {
          tool: 'ask_member',
          input: { agentId: securityId, question: 'Is the login safe?' },
        },
      },
      { text: 'Use rate limits.' },
      { text: 'Security says: use rate limits.' },
    ];
    const events = await run(session.id, 'Review our login.');
    const results = events
      .filter((event) => event.type === 'TOOL_CALL_RESULT')
      .map((event) => JSON.parse(event.content as string) as object);
    expect(results[0]).toEqual({
      refused: expect.stringContaining('invite them with invite_members first'),
    });
    expect(results[1]).toMatchObject({ invited: ['Security'] });
    expect(results[2]).toEqual({
      member: 'Security',
      answer: 'Use rate limits.',
    });
    const after = (await person.get(`${base}/${session.id}`)).body as {
      members: { agentId: string; invited: boolean }[];
    };
    expect(
      after.members.find((member) => member.agentId === securityId)?.invited,
    ).toBe(true);
  });

  it('lets the person address a member directly, when the council allows it', async () => {
    const { councilId } = await council();
    const session = await start(councilId);
    models.replies = [{ text: 'Because it scales.' }];
    const events = await run(session.id, 'Why Postgres?', {
      memberAgentId: architectId,
    });
    expect(shape(events)).toEqual([
      'RUN_STARTED',
      'author:member',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
    expect(models.calls).toHaveLength(1);
    const prompt = JSON.stringify(models.calls[0].prompt);
    expect(prompt).toContain('You design systems.');
    expect(prompt).toContain('The person is asking you directly');
    expect(prompt).toContain('Why Postgres?');

    // The facilitator sees it as the member's answer.
    models.replies = [{ text: 'Noted.' }];
    await run(session.id, 'Facilitator, summarise.');
    expect(JSON.stringify(models.calls[1].prompt)).toContain(
      'Architect, a member of your council, answered the person',
    );

    // Not a member, an agent session, or a council that doesn't allow it.
    const notMember = await person
      .post(`${base}/${session.id}/runs`)
      .send({
        threadId: session.id,
        runId: 'r',
        messages: [{ id: 'x-1', role: 'user', content: 'Hi' }],
        forwardedProps: { memberAgentId: facilitatorId },
      })
      .expect(409);
    expect(notMember.body.code).toBe('SESSION_MEMBER_INVALID');
    const { councilId: closed } = await council(false);
    const other = await start(closed);
    const refused = await person
      .post(`${base}/${other.id}/runs`)
      .send({
        threadId: other.id,
        runId: 'r',
        messages: [{ id: 'x-2', role: 'user', content: 'Hi' }],
        forwardedProps: { memberAgentId: architectId },
      })
      .expect(409);
    expect(refused.body.code).toBe('SESSION_MEMBER_INVALID');
    // Nothing was kept for the refused run.
    expect(await messages(other.id)).toEqual([]);
  });
});
