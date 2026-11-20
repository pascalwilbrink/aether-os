import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import {
  ArtifactNotDraftError,
  ArtifactRejectedError,
  ArtifactsService,
  ReviewsService,
  TaskReviewRoundsExhaustedError,
} from '@hephaestus/artifacts';
import { TasksService } from '@hephaestus/tasks';

import type { FakePolis } from '../../../test/fake-polis.js';
import {
  FakeAgentRuntime,
  FakeSandboxProvisioner,
  FakeTaskTokens,
  testRunnerOptions,
} from '../../../test/fake-runner.js';
import { createTestingModuleWith } from '../../../test/testing-module.js';
import { AgentRuntime, type AgentRunInput } from './agent-runtime.js';
import { RunnerModule } from './runner.module.js';
import { RUNNER_OPTIONS } from './runner.options.js';
import { SandboxProvisioner } from './sandbox-provisioner.js';
import { TaskRunner } from './task-runner.js';
import { TaskTokens } from './task-tokens.js';
import { publishedAgent } from '../../../test/agora.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';

describe('Reviews (Postgres)', () => {
  let moduleRef: TestingModule;
  let polis: FakePolis;
  let runtime: FakeAgentRuntime;
  let organizationId: string;
  let projectId: string;
  let agentId: string;
  let tasks: TasksService;
  let artifacts: ArtifactsService;
  let reviews: ReviewsService;
  let key = 0;

  beforeEach(async () => {
    runtime = new FakeAgentRuntime();
    ({ moduleRef, polis } = await createTestingModuleWith(
      (builder) =>
        builder
          .overrideProvider(RUNNER_OPTIONS)
          .useValue(testRunnerOptions({ maxExecutions: 1 }))
          .overrideProvider(AgentRuntime)
          .useValue(runtime)
          .overrideProvider(TaskTokens)
          .useValue(new FakeTaskTokens())
          .overrideProvider(SandboxProvisioner)
          .useValue(new FakeSandboxProvisioner()),
      RunnerModule,
    ));
    organizationId = polis.organization();
    projectId = polis.project(organizationId);
    const owner = testPrincipal({
      sub: 'user-1',
      subType: 'user',
      organizationId,
      organizationRoles: ['owner'],
      scopes: [],
    });
    tasks = actingAs(moduleRef.get(TasksService), owner);
    artifacts = moduleRef.get(ArtifactsService);
    reviews = actingAs(
      moduleRef.get(ReviewsService),
      testPrincipal({
        sub: 'reviewer-1',
        subType: 'user',
        organizationId,
        organizationRoles: ['admin'],
        scopes: [],
      }),
    );

    const published = await publishedAgent(moduleRef, organizationId, {
      instructions: 'Write.',
      model: { provider: 'scripted', model: 'scripted-model' },
      capabilities: ['chat'],
      tools: [],
      skills: [],
      runtime: {
        provider: 'mastra',
        executionMode: 'standard',
        sandboxRequired: false,
      },
    });
    agentId = published.agentId;
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const createTask = async (artifactKinds: string[]) =>
    (
      await tasks.create(
        organizationId,
        projectId,
        {
          title: 'Write it up',
          instructions: 'A summary and the data, please.',
          agentId,
          serviceAccountId: SERVICE_ACCOUNT,
          review: { artifactKinds },
        },
        `key-${++key}`,
      )
    ).task;

  async function runOnce() {
    const runner = moduleRef.get(TaskRunner);
    await runner.tick();
    await runner.drain();
  }

  const task = (id: string) => tasks.findById(organizationId, projectId, id);
  /** What the agent produced (each run's verification artifact aside). */
  const artifactsOf = async (taskId: string) =>
    (
      await artifacts.list(organizationId, projectId, taskId, { limit: 100 })
    ).items.filter((artifact) => artifact.kind !== 'verification');
  const decide = (
    taskId: string,
    artifactId: string,
    decision: 'approved' | 'rejected' | 'changes_requested',
    comments: { body: string; anchor?: string }[] = [{ body: 'Looks off.' }],
  ) =>
    reviews.decide(
      organizationId,
      projectId,
      taskId,
      artifactId,
      decision,
      decision === 'changes_requested' ? comments : [],
    );

  /** A summary (primary) and some data, as one round. */
  const summaryAndData = async ({
    artifacts: sink,
    revisions,
  }: AgentRunInput) => {
    const revisionOf = (title: string) =>
      revisions.find((artifact) => artifact.title === title)?.id;
    await sink.submit({
      kind: 'text',
      format: 'markdown',
      title: 'Summary',
      content: `Summary v${revisions.length + 1}`,
      primary: true,
      revisionOf: revisionOf('Summary'),
    });
    if (revisions.length === 0 || revisionOf('Data')) {
      await sink.submit({
        kind: 'json',
        title: 'Data',
        content: { rows: 2 },
        revisionOf: revisionOf('Data'),
      });
    }
    return { outcome: 'completed' as const, summary: 'Done.' };
  };

  it('waits for approval of the drafts, then succeeds', async () => {
    runtime.behaviour = summaryAndData;
    const created = await createTask(['*']);

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'awaiting_review',
      reviewRound: 1,
      primaryArtifactId: null,
    });
    const [summary, data] = await artifactsOf(created.id);
    expect([summary.status, data.status]).toEqual(['draft', 'draft']);
    const awaiting = (
      (await moduleRef
        .get(DataSource)
        .query('SELECT message FROM outbox ORDER BY created_at, id')) as {
        message: { eventType: string; payload: Record<string, unknown> };
      }[]
    ).find((row) => row.message.eventType === 'task.awaiting-review');
    expect(awaiting?.message.payload).toEqual({
      taskId: created.id,
      topLevelTaskId: created.id,
      requestedBy: 'user-1',
      draftArtifactIds: [summary.id, data.id],
      round: 1,
    });

    // One approved: the task still waits for the other.
    await expect(
      decide(created.id, data.id, 'approved'),
    ).resolves.toMatchObject({
      status: 'final',
      review: {
        decision: 'approved',
        comments: [],
        decidedBy: 'reviewer-1',
        decidedAt: expect.any(String),
      },
    });
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'awaiting_review',
    });

    await decide(created.id, summary.id, 'approved');
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
      primaryArtifactId: summary.id,
    });

    // Decided is decided.
    await expect(
      decide(created.id, summary.id, 'rejected'),
    ).rejects.toBeInstanceOf(ArtifactNotDraftError);
  });

  it('only holds back the kinds that need approval', async () => {
    runtime.behaviour = summaryAndData;
    const created = await createTask(['json']);

    await runOnce();

    const [summary, data] = await artifactsOf(created.id);
    expect([summary.status, data.status]).toEqual(['final', 'draft']);
    await decide(created.id, data.id, 'approved');
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
      primaryArtifactId: summary.id,
    });
  });

  it('fails the task when a draft is rejected', async () => {
    runtime.behaviour = summaryAndData;
    const created = await createTask(['json']);
    await runOnce();
    const [summary, data] = await artifactsOf(created.id);

    await decide(created.id, data.id, 'rejected');

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'rejected',
    });
    expect(
      (await artifactsOf(created.id)).map((a) => [a.title, a.status]),
    ).toEqual([
      // Final stays final (delivered); the rejected one stays rejected.
      [summary.title, 'final'],
      [data.title, 'rejected'],
    ]);
  });

  it('runs the agent again with the comments, and takes its revision', async () => {
    runtime.behaviour = summaryAndData;
    const created = await createTask(['*']);
    await runOnce();
    const [summary, data] = await artifactsOf(created.id);

    // Changes on one; the task waits until the other is decided too.
    await decide(created.id, summary.id, 'changes_requested', [
      { body: 'Too short.', anchor: 'line 1' },
    ]);
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'awaiting_review',
    });
    await decide(created.id, data.id, 'approved');
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'queued',
    });

    await runOnce();

    // The revision run got what was sent back, with the comments.
    expect(runtime.runs[1].revisions).toEqual([
      expect.objectContaining({
        id: summary.id,
        title: 'Summary',
        status: 'changes_requested',
        review: expect.objectContaining({
          decision: 'changes_requested',
          comments: [{ body: 'Too short.', anchor: 'line 1' }],
        }),
      }),
    ]);
    const revised = (await artifactsOf(created.id))[2];
    expect(revised).toMatchObject({
      title: 'Summary',
      status: 'draft',
      primary: true,
      revisionOf: summary.id,
      content: 'Summary v2',
    });
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'awaiting_review',
      reviewRound: 2,
    });

    await decide(created.id, revised.id, 'approved');
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
      primaryArtifactId: revised.id,
    });
    expect(
      (await artifactsOf(created.id)).map((a) => [a.title, a.status]),
    ).toEqual([
      ['Summary', 'changes_requested'],
      ['Data', 'final'],
      ['Summary', 'final'],
    ]);
  });

  it("links an agent's answer to the answer a reviewer sent back", async () => {
    // An agent that only answers (no submit_artifact).
    runtime.behaviour = ({ revisions }) =>
      Promise.resolve({
        outcome: 'completed',
        summary: revisions.length ? 'Better answer.' : 'First answer.',
      });
    const created = await createTask(['*']);
    await runOnce();
    const [first] = await artifactsOf(created.id);

    await decide(created.id, first.id, 'changes_requested');
    await runOnce();

    const [, revised] = await artifactsOf(created.id);
    expect(revised).toMatchObject({
      title: 'Answer',
      content: 'Better answer.',
      status: 'draft',
      revisionOf: first.id,
    });
  });

  it('stops asking for changes after the last review round', async () => {
    runtime.behaviour = summaryAndData;
    const created = await createTask(['text']);
    await runOnce();

    for (let round = 1; round <= 2; round++) {
      const draft = (await artifactsOf(created.id)).find(
        (a) => a.status === 'draft',
      )!;
      await decide(created.id, draft.id, 'changes_requested');
      await runOnce();
    }
    await expect(task(created.id)).resolves.toMatchObject({ reviewRound: 3 });
    const last = (await artifactsOf(created.id)).find(
      (a) => a.status === 'draft',
    )!;

    await expect(
      decide(created.id, last.id, 'changes_requested'),
    ).rejects.toBeInstanceOf(TaskReviewRoundsExhaustedError);
    await decide(created.id, last.id, 'approved');
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
  });

  it('leaves no drafts waiting when the task is cancelled', async () => {
    runtime.behaviour = summaryAndData;
    const created = await createTask(['*']);
    await runOnce();

    await tasks.cancel(organizationId, projectId, created.id);

    expect(
      (await artifactsOf(created.id)).map((a) => [a.status, a.primary]),
    ).toEqual([
      ['partial', false],
      ['partial', false],
    ]);
  });

  it("refuses a revision of something that wasn't sent back", async () => {
    let refused: unknown;
    runtime.behaviour = async ({ artifacts: sink }) => {
      refused = await sink
        .submit({
          kind: 'text',
          format: 'plain',
          title: 'Sneaky',
          content: 'x',
          revisionOf: '0193a1b2-c3d4-7e5f-8a9b-0000000000ee',
        })
        .catch((error: unknown) => error);
      return { outcome: 'completed', summary: 'Done.' };
    };
    await createTask([]);

    await runOnce();

    expect(refused).toBeInstanceOf(ArtifactRejectedError);
  });
});
