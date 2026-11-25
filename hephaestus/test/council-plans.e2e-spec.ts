import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import {
  AgentRuntime,
  RUNNER_OPTIONS,
  SandboxProvisioner,
  TaskRunner,
  TaskTokens,
} from '@hephaestus/runner';

import { publishedAgent, publishedCouncil } from './agora.js';
import { createApp } from './app.js';
import { asMember, type Client } from './auth.js';
import type { ScriptedPylonModels } from './fake-models.js';
import type { FakePolis } from './fake-polis.js';
import {
  FakeAgentRuntime,
  FakeSandboxProvisioner,
  FakeTaskTokens,
  testRunnerOptions,
} from './fake-runner.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';

interface AguiEvent {
  type: string;
  [key: string]: unknown;
}

interface Plan {
  id: string;
  number: number;
  status: string;
  entries: { key: string; agentId: string }[];
  outcomeEntryKey: string;
  review: { decision: string; comment: string | null } | null;
  taskId: string | null;
}

interface Task {
  id: string;
  title: string;
  status: string;
  agentId: string;
  parentTaskId: string | null;
  dependsOn: string[];
  primaryArtifactId: string | null;
  failureReason: string | null;
  origin: {
    kind: string;
    planId: string;
    entryKey: string | null;
    outcomeEntryKey: string | null;
    assignedBy: string | null;
    reason: string | null;
  } | null;
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

describe('Council plans (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let models: ScriptedPylonModels;
  let runtime: FakeAgentRuntime;
  let orgId: string;
  let projectId: string;
  let facilitatorId: string;
  let architectId: string;
  let builderId: string;
  let person: Client;
  let base: string;
  let tasksBase: string;

  beforeEach(async () => {
    runtime = new FakeAgentRuntime();
    ({ app, polis, models } = await createApp((builder) =>
      builder
        .overrideProvider(RUNNER_OPTIONS)
        .useValue(testRunnerOptions())
        .overrideProvider(AgentRuntime)
        .useValue(runtime)
        .overrideProvider(TaskTokens)
        .useValue(new FakeTaskTokens())
        .overrideProvider(SandboxProvisioner)
        .useValue(new FakeSandboxProvisioner()),
    ));
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
    ({ agentId: builderId } = await publishedAgent(app, orgId, {
      name: 'Builder',
      instructions: 'You build.',
    }));
    person = await asMember(app, orgId, ['member'], {
      [projectId]: 'approver',
    });
    base = `/v1/organizations/${orgId}/projects/${projectId}/sessions`;
    tasksBase = `/v1/organizations/${orgId}/projects/${projectId}/tasks`;
  });

  afterEach(async () => {
    await app.close();
  });

  const council = (allowDelegation = true) =>
    publishedCouncil(app, orgId, {
      facilitatorId,
      allowDelegation,
      defaultMode: 'planning',
      members: [
        { agentId: architectId, participation: 'required' },
        { agentId: builderId, participation: 'required' },
      ],
    });

  let runs = 0;
  const run = async (
    client: Client,
    sessionId: string,
    content: string,
  ): Promise<AguiEvent[]> => {
    const response = await client
      .post(`${base}/${sessionId}/runs`)
      .send({
        threadId: sessionId,
        runId: `run-${++runs}`,
        messages: [{ id: `m-${runs}`, role: 'user', content }],
      })
      .buffer(true)
      .parse(sseText)
      .expect(200);
    return eventsOf(response.body as string);
  };

  const proposal = () => ({
    title: 'Add sign-in with passkeys',
    summary: 'Design it, then build it.',
    milestones: [
      { key: 'design', title: 'Design' },
      { key: 'build', title: 'Build', dependsOn: ['design'] },
    ],
    entries: [
      {
        key: 'design-flow',
        title: 'Design the passkey flow',
        description: 'Write how registration and sign-in work.',
        agentId: architectId,
        milestoneKey: 'design',
        reason: 'The architect designs flows.',
      },
      {
        key: 'implement',
        title: 'Implement passkeys',
        description: 'Build what the design says.',
        agentId: builderId,
        milestoneKey: 'build',
        reason: 'The builder builds.',
      },
    ],
  });

  /** A session whose facilitator proposed the plan; the plan as kept. */
  const proposed = async (
    allowDelegation = true,
    client: Client = person,
  ): Promise<{ sessionId: string; plan: Plan; events: AguiEvent[] }> => {
    const { councilId } = await council(allowDelegation);
    const session = (await client.post(base).send({ councilId }).expect(201))
      .body as { id: string; mode: string };
    expect(session.mode).toBe('planning');
    models.replies = [
      { toolCall: { tool: 'propose_plan', input: proposal() } },
      { text: 'The plan is ready for you to review.' },
    ];
    const events = await run(client, session.id, 'Plan passkeys for us.');
    const plans = (await client.get(`${base}/${session.id}/plans`).expect(200))
      .body.items as Plan[];
    expect(plans).toHaveLength(1);
    return { sessionId: session.id, plan: plans[0], events };
  };

  const task = async (taskId: string) =>
    (await person.get(`${tasksBase}/${taskId}`).expect(200)).body as Task;

  /** Oldest first (the list is newest first). */
  const subtasks = async (taskId: string) =>
    (
      (await person.get(tasksBase).query({ parentTaskId: taskId }).expect(200))
        .body.items as Task[]
    ).reverse();

  const runAll = async () => {
    const runner = app.get(TaskRunner);
    for (let round = 0; round < 4; round++) {
      await runner.tick();
      await runner.drain();
    }
  };

  it('keeps a plan the facilitator proposes, and tells it about the plan later', async () => {
    const { sessionId, plan, events } = await proposed();
    expect(JSON.stringify(models.calls[0].prompt)).toContain('### Plans');
    expect(
      events.find(
        (event) => event.type === 'CUSTOM' && event.name === 'plan-proposed',
      )?.value,
    ).toEqual({
      planId: plan.id,
      number: 1,
      title: 'Add sign-in with passkeys',
    });
    expect(plan).toMatchObject({
      number: 1,
      status: 'proposed',
      outcomeEntryKey: 'implement',
      review: null,
      taskId: null,
    });

    models.replies = [{ text: 'Waiting for your review.' }];
    await run(person, sessionId, 'Thanks.');
    expect(JSON.stringify(models.calls.at(-1)?.prompt)).toContain(
      'Plan 1, \\"Add sign-in with passkeys\\": proposed',
    );
  });

  it('refuses a plan that breaks the rules, with every reason', async () => {
    const { councilId } = await council();
    const session = (await person.post(base).send({ councilId }).expect(201))
      .body as { id: string };
    const broken = proposal();
    broken.entries[0].agentId = facilitatorId;
    broken.entries[1].milestoneKey = 'nowhere';
    models.replies = [
      { toolCall: { tool: 'propose_plan', input: broken } },
      { text: 'Let me fix that.' },
    ];
    const events = await run(person, session.id, 'Plan it.');
    const result = JSON.parse(
      events.find((event) => event.type === 'TOOL_CALL_RESULT')
        ?.content as string,
    ) as { refused: string; problems: string[] };
    expect(result.refused).toContain('needs fixing');
    expect(result.problems).toHaveLength(2);
    expect(
      (await person.get(`${base}/${session.id}/plans`).expect(200)).body.items,
    ).toEqual([]);
  });

  it('approving makes a waiting plan task with the entries as its subtasks, which settle it', async () => {
    const { sessionId, plan } = await proposed();
    const approved = (
      await person
        .post(`${base}/${sessionId}/plans/${plan.id}/approve`)
        .send({
          serviceAccountId: SERVICE_ACCOUNT,
          assignments: [{ entryKey: 'design-flow', agentId: builderId }],
        })
        .expect(200)
    ).body as Plan;
    expect(approved.status).toBe('approved');
    expect(approved.review).toMatchObject({ decision: 'approved' });
    expect(approved.entries[0].agentId).toBe(builderId);
    expect(approved.taskId).toEqual(expect.any(String));

    const planTask = await task(approved.taskId as string);
    expect(planTask).toMatchObject({
      title: 'Add sign-in with passkeys',
      status: 'waiting',
      agentId: facilitatorId,
      parentTaskId: null,
      origin: {
        kind: 'council-plan',
        planId: plan.id,
        entryKey: null,
        outcomeEntryKey: 'implement',
      },
    });
    const [design, implement] = await subtasks(planTask.id);
    expect(design).toMatchObject({
      title: 'Design the passkey flow',
      status: 'queued',
      agentId: builderId,
      dependsOn: [],
      origin: { entryKey: 'design-flow', assignedBy: 'user-1', reason: null },
    });
    expect(implement).toMatchObject({
      status: 'blocked',
      agentId: builderId,
      dependsOn: [design.id],
      origin: {
        entryKey: 'implement',
        assignedBy: 'facilitator',
        reason: 'The builder builds.',
      },
    });

    // Decided once.
    await person
      .post(`${base}/${sessionId}/plans/${plan.id}/approve`)
      .send({ serviceAccountId: SERVICE_ACCOUNT })
      .expect(409)
      .expect((response) =>
        expect(response.body).toMatchObject({ code: 'PLAN_NOT_PROPOSED' }),
      );

    await runAll();
    const done = await subtasks(planTask.id);
    expect(done.map((subtask) => subtask.status)).toEqual([
      'succeeded',
      'succeeded',
    ]);
    const settled = await task(planTask.id);
    expect(settled.status).toBe('succeeded');
    expect(settled.primaryArtifactId).toBe(done[1].primaryArtifactId);

    // The facilitator hears how its tasks went.
    models.replies = [{ text: 'All done.' }];
    await run(person, sessionId, 'How is it going?');
    const prompt = JSON.stringify(models.calls.at(-1)?.prompt);
    expect(prompt).toContain('design-flow succeeded');
    expect(prompt).toContain('(the plan task: succeeded)');
  });

  it('fails the plan task when a subtask fails, and cancels what is left', async () => {
    const { sessionId, plan } = await proposed();
    const approved = (
      await person
        .post(`${base}/${sessionId}/plans/${plan.id}/approve`)
        .send({ serviceAccountId: SERVICE_ACCOUNT })
        .expect(200)
    ).body as Plan;
    runtime.behaviour = () =>
      Promise.resolve({ outcome: 'failed', error: 'Could not do it.' });
    await runAll();

    const planTask = await task(approved.taskId as string);
    expect(planTask).toMatchObject({
      status: 'failed',
      failureReason: 'subtask_failed',
    });
    const [design, implement] = await subtasks(planTask.id);
    expect(design).toMatchObject({
      status: 'failed',
      failureReason: 'agent_failed',
    });
    expect(implement.status).toBe('cancelled');
    // A subtask can't be retried once its plan task has ended.
    const refused = await person
      .post(`${tasksBase}/${design.id}/retry`)
      .expect(409);
    expect(refused.body).toMatchObject({ code: 'TASK_PARENT_FINISHED' });
  });

  it('without delegation, approving makes no tasks', async () => {
    const { sessionId, plan } = await proposed(false);
    const approved = (
      await person
        .post(`${base}/${sessionId}/plans/${plan.id}/approve`)
        .send({ serviceAccountId: SERVICE_ACCOUNT })
        .expect(200)
    ).body as Plan;
    expect(approved).toMatchObject({ status: 'approved', taskId: null });
  });

  it('refuses assignments to someone outside the council', async () => {
    const { sessionId, plan } = await proposed();
    const refused = await person
      .post(`${base}/${sessionId}/plans/${plan.id}/approve`)
      .send({
        serviceAccountId: SERVICE_ACCOUNT,
        assignments: [{ entryKey: 'implement', agentId: facilitatorId }],
      })
      .expect(409);
    expect(refused.body).toMatchObject({ code: 'PLAN_ASSIGNMENT_INVALID' });
    const after = (await person.get(`${base}/${sessionId}/plans`)).body
      .items as Plan[];
    expect(after[0].status).toBe('proposed');
  });

  it('a plan sent back is revised, and the revision supersedes nothing approved', async () => {
    const { sessionId, plan } = await proposed();
    const sentBack = (
      await person
        .post(`${base}/${sessionId}/plans/${plan.id}/request-changes`)
        .send({ comment: 'Add a security review.' })
        .expect(200)
    ).body as Plan;
    expect(sentBack).toMatchObject({
      status: 'changes_requested',
      review: {
        decision: 'changes_requested',
        comment: 'Add a security review.',
      },
    });

    models.replies = [
      { toolCall: { tool: 'propose_plan', input: proposal() } },
      { text: 'Revised.' },
    ];
    await run(person, sessionId, 'Please revise it.');
    expect(JSON.stringify(models.calls[2].prompt)).toContain(
      'Add a security review.',
    );
    const plans = (await person.get(`${base}/${sessionId}/plans`)).body
      .items as Plan[];
    expect(
      plans.map((candidate) => [candidate.number, candidate.status]),
    ).toEqual([
      [1, 'changes_requested'],
      [2, 'proposed'],
    ]);

    // Proposing again replaces a proposal still waiting.
    models.replies = [
      { toolCall: { tool: 'propose_plan', input: proposal() } },
      { text: 'Revised again.' },
    ];
    await run(person, sessionId, 'One more time.');
    const latest = (await person.get(`${base}/${sessionId}/plans`)).body
      .items as Plan[];
    expect(latest.map((candidate) => candidate.status)).toEqual([
      'changes_requested',
      'superseded',
      'proposed',
    ]);

    const rejected = (
      await person
        .post(`${base}/${sessionId}/plans/${latest[2].id}/reject`)
        .send({ comment: 'Not now.' })
        .expect(200)
    ).body as Plan;
    expect(rejected).toMatchObject({
      status: 'rejected',
      review: { decision: 'rejected', comment: 'Not now.' },
    });
  });

  it('only the person who started the session, with approval rights, decides', async () => {
    const viewer = await asMember(
      app,
      orgId,
      ['member'],
      { [projectId]: 'viewer' },
      'user-2',
    );
    const { sessionId, plan } = await proposed(true, viewer);
    await viewer
      .post(`${base}/${sessionId}/plans/${plan.id}/approve`)
      .send({ serviceAccountId: SERVICE_ACCOUNT })
      .expect(403);
    // Someone else's session is a 404.
    await person.get(`${base}/${sessionId}/plans`).expect(404);
    await person
      .post(`${base}/${sessionId}/plans/${plan.id}/reject`)
      .send({})
      .expect(404);
  });
});
