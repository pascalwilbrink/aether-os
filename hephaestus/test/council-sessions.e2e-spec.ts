import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';

import { createAgent, publishedAgent, publishedCouncil } from './agora.js';
import { createApp } from './app.js';
import { asMember, type Client } from './auth.js';
import type { FakeKnowledgeBase } from './fake-knowledge.js';
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
  let knowledgeBase: FakeKnowledgeBase;
  let orgId: string;
  let projectId: string;
  let facilitatorId: string;
  let architectId: string;
  let securityId: string;
  let person: Client;
  let base: string;

  beforeEach(async () => {
    ({ app, polis, models, sessionTokens, knowledgeBase } = await createApp());
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

  describe('deliberation rounds', () => {
    const roundCouncil = (
      discussion?: Parameters<typeof publishedCouncil>[2]['discussion'],
      allowDiscussion = true,
    ) =>
      publishedCouncil(app, orgId, {
        facilitatorId,
        allowDiscussion,
        discussion,
        members: [
          { agentId: architectId, participation: 'required', role: 'design' },
          {
            agentId: securityId,
            participation: 'conditional',
            when: 'Anything touching authentication',
          },
        ],
      });

    const results = (events: AguiEvent[]) =>
      events
        .filter((event) => event.type === 'TOOL_CALL_RESULT')
        .map(
          (event) =>
            JSON.parse(event.content as string) as Record<string, unknown>,
        );

    it('puts a question to the members in turn, and keeps the round with its conclusion', async () => {
      const { councilId, versionId } = await roundCouncil();
      const session = await start(councilId);
      models.replies = [
        {
          toolCall: {
            tool: 'start_round',
            input: {
              question: 'How should people sign in?',
              participants: [securityId],
              reason: 'It touches authentication.',
            },
          },
        },
        { text: 'Passkeys, with a password fallback.' },
        { text: 'Agreed on passkeys; rate-limit the fallback.' },
        {
          toolCall: {
            tool: 'conclude_round',
            input: {
              conclusion: 'Passkeys first; a rate-limited password fallback.',
            },
          },
        },
        { text: 'The council recommends passkeys.' },
      ];
      const events = await run(session.id, 'Decide how people sign in.');

      const custom = events.filter((event) => event.type === 'CUSTOM');
      const started = custom.find((event) => event.name === 'round-started');
      expect(started?.value).toMatchObject({
        number: 1,
        question: 'How should people sign in?',
        // The required member first, then the one named.
        participants: [architectId, securityId],
      });
      const roundId = ((started as AguiEvent).value as { roundId: string })
        .roundId;
      // Members' answers are announced as the round's.
      const memberAuthors = custom
        .filter(
          (event) =>
            event.name === 'message-author' &&
            (event.value as { author: { kind: string } }).author.kind ===
              'member',
        )
        .map((event) => (event.value as { roundId?: string }).roundId);
      expect(memberAuthors).toEqual([roundId, roundId]);
      expect(
        custom.find((event) => event.name === 'round-concluded')?.value,
      ).toEqual({
        roundId,
        number: 1,
        conclusion: 'Passkeys first; a rate-limited password fallback.',
      });
      const [round, concluded] = results(events);
      expect(round).toMatchObject({
        round: 1,
        roundsLeft: 2,
        answers: [
          {
            member: 'Architect',
            answer: 'Passkeys, with a password fallback.',
          },
          {
            member: 'Security',
            answer: 'Agreed on passkeys; rate-limit the fallback.',
          },
        ],
      });
      expect(concluded).toEqual({ round: 1, concluded: true, roundsLeft: 2 });

      // The facilitator was told how rounds work; the second member saw the
      // first's answer (members respond to each other by default).
      expect(JSON.stringify(models.calls[0].prompt)).toContain(
        'Deliberation rounds',
      );
      expect(models.calls[0].tools?.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['start_round', 'conclude_round']),
      );
      expect(JSON.stringify(models.calls[2].prompt)).toContain(
        'Passkeys, with a password fallback.',
      );
      expect(JSON.stringify(models.calls[2].prompt)).toContain(
        "Round 1 of the council's discussion",
      );

      // Kept: the round, the members' answers in it, the event, and the
      // conditional member taking part from now on.
      const rounds = (
        await person.get(`${base}/${session.id}/rounds`).expect(200)
      ).body.items as Record<string, unknown>[];
      expect(rounds).toEqual([
        expect.objectContaining({
          id: roundId,
          sessionId: session.id,
          number: 1,
          question: 'How should people sign in?',
          participants: [architectId, securityId],
          status: 'concluded',
          conclusion: 'Passkeys first; a rate-limited password fallback.',
          concludedAt: expect.any(String),
        }),
      ]);
      const kept = (await person.get(`${base}/${session.id}/messages`)).body
        .items as { author: { kind: string }; roundId: string | null }[];
      expect(
        kept
          .filter((message) => message.author.kind === 'member')
          .map((message) => message.roundId),
      ).toEqual([roundId, roundId]);
      expect(
        kept
          .filter((message) => message.author.kind !== 'member')
          .every((message) => message.roundId === null),
      ).toBe(true);
      const [event] = (
        (await app
          .get(DataSource)
          .query(
            `SELECT message->'payload' AS payload FROM outbox WHERE routing_key = 'deliberation-round.concluded'`,
          )) as { payload: Record<string, unknown> }[]
      ).map((row) => row.payload);
      expect(event).toEqual({
        sessionId: session.id,
        councilId,
        councilVersionId: versionId,
        roundId,
        number: 1,
        question: 'How should people sign in?',
        participants: [architectId, securityId],
        conclusion: 'Passkeys first; a rate-limited password fallback.',
      });
      const after = (await person.get(`${base}/${session.id}`)).body as {
        members: { agentId: string; invited: boolean }[];
      };
      expect(
        after.members.find((member) => member.agentId === securityId)?.invited,
      ).toBe(true);
    });

    it('keeps members apart when they answer independently', async () => {
      const { councilId } = await roundCouncil({ allowAgentResponses: false });
      const session = await start(councilId);
      models.replies = [
        {
          toolCall: {
            tool: 'start_round',
            input: { question: 'Which queue?', participants: [securityId] },
          },
        },
        { text: 'RabbitMQ, it is already there.' },
        { text: 'Whichever supports TLS.' },
        { text: 'Two views.' },
      ];
      await run(session.id, 'Pick a queue.');
      const second = JSON.stringify(models.calls[2].prompt);
      expect(second).not.toContain('RabbitMQ, it is already there.');
      expect(second).toContain("you don't see the other members' answers");
    });

    it('refuses rounds the council does not allow', async () => {
      const { councilId } = await roundCouncil({ maxRounds: 1 });
      const session = await start(councilId);
      models.replies = [
        {
          toolCall: {
            tool: 'start_round',
            input: { question: 'First?', participants: [] },
          },
        },
        { text: 'Yes.' },
        {
          toolCall: {
            tool: 'start_round',
            input: { question: 'Second?', participants: [] },
          },
        },
        {
          toolCall: {
            tool: 'conclude_round',
            input: { conclusion: 'Yes to the first.' },
          },
        },
        {
          toolCall: {
            tool: 'start_round',
            input: { question: 'Third?', participants: [] },
          },
        },
        {
          toolCall: {
            tool: 'conclude_round',
            input: { conclusion: 'Again.' },
          },
        },
        {
          toolCall: {
            tool: 'start_round',
            input: { question: 'Who?', participants: [facilitatorId] },
          },
        },
        { text: 'Done.' },
      ];
      const events = await run(session.id, 'Discuss.');
      const [, unconcluded, , pastMax, nothingOpen, notMember] =
        results(events);
      expect(unconcluded.refused).toContain('Round 1 is still open');
      expect(pastMax.refused).toContain('has had its 1 rounds');
      expect(nothingOpen.refused).toContain('No round is open');
      expect(notMember.refused).toContain('Not members of this council');
      const rounds = (await person.get(`${base}/${session.id}/rounds`)).body
        .items as unknown[];
      expect(rounds).toHaveLength(1);

      // Without discussion, the facilitator has no round tools.
      const { councilId: quiet } = await roundCouncil(undefined, false);
      const other = await start(quiet);
      models.replies = [{ text: 'Hello.' }];
      await run(other.id, 'Hi.');
      expect(
        (models.calls.at(-1)?.tools ?? []).map((tool) => tool.name),
      ).not.toContain('start_round');
    });

    it('closes an open round without a conclusion when the council does not require one', async () => {
      const { councilId } = await roundCouncil({
        requireFacilitatorConclusion: false,
      });
      const session = await start(councilId);
      models.replies = [
        {
          toolCall: {
            tool: 'start_round',
            input: { question: 'One?', participants: [] },
          },
        },
        { text: 'A.' },
        {
          toolCall: {
            tool: 'start_round',
            input: { question: 'Two?', participants: [] },
          },
        },
        { text: 'B.' },
        { text: 'Done.' },
      ];
      await run(session.id, 'Discuss.');
      const rounds = (await person.get(`${base}/${session.id}/rounds`)).body
        .items as {
        number: number;
        status: string;
        conclusion: string | null;
      }[];
      expect(
        rounds.map(({ number, status, conclusion }) => ({
          number,
          status,
          conclusion,
        })),
      ).toEqual([
        { number: 1, status: 'concluded', conclusion: null },
        { number: 2, status: 'open', conclusion: null },
      ]);
      // A round left open is still open on the next turn.
      models.replies = [{ text: 'Carrying on.' }];
      await run(session.id, 'Go on.');
      expect(JSON.stringify(models.calls.at(-1)?.prompt)).toContain(
        'Round 2 is open',
      );
    });
  });

  describe('modes', () => {
    const modeCouncil = (
      fields: {
        defaultMode?:
          'direct' | 'facilitated' | 'discussion' | 'planning' | 'delegation';
        allowDiscussion?: boolean;
      } = {},
    ) =>
      publishedCouncil(app, orgId, {
        facilitatorId,
        ...fields,
        members: [{ agentId: architectId, participation: 'required' }],
      });

    it("starts in the council's default mode, and the person can switch among those it allows", async () => {
      const { councilId } = await modeCouncil({ defaultMode: 'discussion' });
      const session = (await person.post(base).send({ councilId }).expect(201))
        .body as { id: string; mode: string };
      expect(session.mode).toBe('discussion');

      const switched = await person
        .post(`${base}/${session.id}/mode`)
        .send({ mode: 'direct' })
        .expect(200);
      expect(switched.body.mode).toBe('direct');
      // The same mode again: unchanged.
      await person
        .post(`${base}/${session.id}/mode`)
        .send({ mode: 'direct' })
        .expect(200);

      const delegation = await person
        .post(`${base}/${session.id}/mode`)
        .send({ mode: 'delegation' })
        .expect(409);
      expect(delegation.body).toMatchObject({ code: 'SESSION_MODE_INVALID' });
      expect(delegation.body.detail).toContain(
        "doesn't allow the delegation mode",
      );
      await person
        .post(`${base}/${session.id}/mode`)
        .send({ mode: 'chatting' })
        .expect(400);

      // An agent session has no modes; a mode the council doesn't allow is refused.
      const agentSession = (
        await person.post(base).send({ agentId: facilitatorId }).expect(201)
      ).body as { id: string; mode: string | null };
      expect(agentSession.mode).toBeNull();
      await person
        .post(`${base}/${agentSession.id}/mode`)
        .send({ mode: 'facilitated' })
        .expect(409);
      const { councilId: quiet } = await modeCouncil({
        allowDiscussion: false,
      });
      const other = (
        await person.post(base).send({ councilId: quiet }).expect(201)
      ).body as {
        id: string;
        mode: string;
      };
      expect(other.mode).toBe('facilitated');
      const refused = await person
        .post(`${base}/${other.id}/mode`)
        .send({ mode: 'discussion' })
        .expect(409);
      expect(refused.body.detail).toContain(
        "doesn't allow the discussion mode",
      );
    });

    it("a council whose default it doesn't allow starts facilitated", async () => {
      const { councilId } = await modeCouncil({ defaultMode: 'delegation' });
      const session = (await person.post(base).send({ councilId }).expect(201))
        .body as {
        mode: string;
      };
      expect(session.mode).toBe('facilitated');
    });

    it('lets the facilitator switch modes, and keeps the switch', async () => {
      const { councilId } = await modeCouncil();
      const session = await start(councilId);
      models.replies = [
        {
          toolCall: {
            tool: 'set_mode',
            input: { mode: 'delegation', reason: 'Delegate it.' },
          },
        },
        {
          toolCall: {
            tool: 'set_mode',
            input: { mode: 'discussion', reason: 'This needs the council.' },
          },
        },
        { text: 'Switched to a discussion.' },
      ];
      const events = await run(session.id, 'Let us discuss.');
      expect(JSON.stringify(models.calls[0].prompt)).toContain(
        'Mode: facilitated.',
      );
      const results = events
        .filter((event) => event.type === 'TOOL_CALL_RESULT')
        .map(
          (event) =>
            JSON.parse(event.content as string) as Record<string, unknown>,
        );
      expect(results[0].refused).toContain("can't be in the delegation mode");
      expect(results[1]).toMatchObject({ mode: 'discussion' });
      expect(
        events.find(
          (event) => event.type === 'CUSTOM' && event.name === 'mode-changed',
        )?.value,
      ).toEqual({ mode: 'discussion', reason: 'This needs the council.' });
      const after = (await person.get(`${base}/${session.id}`)).body as {
        mode: string;
      };
      expect(after.mode).toBe('discussion');

      // The next turn starts in it.
      models.replies = [{ text: 'Go on.' }];
      await run(session.id, 'Next.');
      expect(JSON.stringify(models.calls.at(-1)?.prompt)).toContain(
        'Mode: discussion.',
      );
    });
  });

  describe('decisions and syntheses', () => {
    const toolResults = (events: AguiEvent[]) =>
      events
        .filter((event) => event.type === 'TOOL_CALL_RESULT')
        .map(
          (event) =>
            JSON.parse(event.content as string) as Record<string, unknown>,
        );

    it("proposes the council's decision to Seshat with the facilitator's token, and keeps its synthesis", async () => {
      knowledgeBase.available = true;
      const { councilId } = await council();
      const session = await start(councilId);
      models.replies = [
        {
          toolCall: {
            tool: 'start_round',
            input: { question: 'Which queue?' },
          },
        },
        { text: 'RabbitMQ: we run it already.' },
        {
          toolCall: {
            tool: 'conclude_round',
            input: { conclusion: 'RabbitMQ.' },
          },
        },
        {
          toolCall: {
            tool: 'record_decision',
            input: {
              title: 'Use RabbitMQ for events',
              decision: 'Services publish their events to RabbitMQ.',
              rationale: 'We run it already.',
              alternatives: [
                { option: 'Kafka', reason: 'Another system to run.' },
              ],
              round: 1,
            },
          },
        },
        {
          toolCall: {
            tool: 'record_decision',
            input: {
              title: 'From nowhere',
              decision: 'Nothing.',
              rationale: 'None.',
              round: 7,
            },
          },
        },
        {
          toolCall: {
            tool: 'write_synthesis',
            input: {
              content:
                'Asked: which queue. Decided: RabbitMQ. Open: retention.',
              rounds: [1],
            },
          },
        },
        { text: 'Recorded; accept it in Knowledge.' },
      ];
      const events = await run(session.id, 'Which queue should we use?');

      // The facilitator is told about both, and the council requires a synthesis.
      expect(JSON.stringify(models.calls[0].prompt)).toContain(
        'This council requires a synthesis',
      );
      const proposal = knowledgeBase.calls.find(
        (call) => call.method === 'propose',
      );
      // The facilitator's own session token (the first one issued).
      expect(proposal?.scope).toEqual({
        organizationId: orgId,
        projectId,
        token: 'session-token-1',
      });
      const rounds = (await person.get(`${base}/${session.id}/rounds`)).body
        .items as { id: string }[];
      expect(proposal?.input).toEqual({
        type: 'decision',
        title: 'Use RabbitMQ for events',
        body: 'Services publish their events to RabbitMQ.',
        rationale: 'We run it already.',
        alternatives: [{ option: 'Kafka', reason: 'Another system to run.' }],
        references: [
          { kind: 'session', id: session.id, title: 'Council session' },
          { kind: 'round', id: rounds[0].id, title: 'Round 1' },
        ],
      });
      const results = toolResults(events);
      expect(results.find((result) => 'decision' in result)).toMatchObject({
        status: 'proposed',
      });
      expect(
        results.find(
          (result) =>
            typeof result.refused === 'string' &&
            result.refused.includes('round 7'),
        ),
      ).toBeDefined();
      expect(
        events
          .filter((event) => event.type === 'CUSTOM')
          .map((event) => event.name),
      ).toEqual(
        expect.arrayContaining(['decision-recorded', 'synthesis-written']),
      );

      const syntheses = (
        await person.get(`${base}/${session.id}/syntheses`).expect(200)
      ).body.items;
      expect(syntheses).toEqual([
        expect.objectContaining({
          number: 1,
          content: 'Asked: which queue. Decided: RabbitMQ. Open: retention.',
          roundIds: [rounds[0].id],
        }),
      ]);
      // The next turn knows there's one.
      models.replies = [{ text: 'Anything else?' }];
      await run(session.id, 'Thanks.');
      expect(JSON.stringify(models.calls.at(-1)?.prompt)).toContain(
        'The session has 1 so far.',
      );
    });

    it('offers no record_decision without Seshat, and tells Seshat refusing', async () => {
      const { councilId } = await council();
      const session = await start(councilId);
      models.replies = [{ text: 'Hello.' }];
      await run(session.id, 'Hi.');
      const offered = (models.calls[0].tools ?? []).map((tool) => tool.name);
      expect(offered).not.toContain('record_decision');
      expect(offered).toContain('write_synthesis');
      // Another person's session: a 404.
      const other = await asMember(
        app,
        orgId,
        ['member'],
        { [projectId]: 'viewer' },
        'user-2',
      );
      await other.get(`${base}/${session.id}/syntheses`).expect(404);
    });
  });
});
