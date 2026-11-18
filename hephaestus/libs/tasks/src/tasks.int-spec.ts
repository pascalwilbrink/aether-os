import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { AgentsService, AgentVersionsService } from '@hephaestus/agents';

import type { FakePolis } from '../../../test/fake-polis.js';
import { createTestingModule } from '../../../test/testing-module.js';
import { TasksModule } from './tasks.module.js';
import { TasksService } from './tasks.service.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';
const ARTIFACT = '0193a1b2-c3d4-7e5f-8a9b-0000000000ff';

const caller = testPrincipal({
  sub: 'user-1',
  subType: 'user',
  organizationId: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  organizationRoles: ['owner'],
  scopes: [],
});

const versionBody = {
  instructions: 'Be helpful.',
  model: { provider: 'anthropic', model: 'claude', temperature: 0.2 },
  capabilities: ['chat'],
  tools: [],
  skills: [],
  runtime: {
    provider: 'local',
    executionMode: 'standard' as const,
    sandboxRequired: false,
  },
};

describe('TasksService (Postgres)', () => {
  let moduleRef: TestingModule;
  let tasks: TasksService;
  let polis: FakePolis;
  let orgId: string;
  let projectId: string;
  let agentId: string;
  let key = 0;

  beforeEach(async () => {
    ({ moduleRef, polis } = await createTestingModule(TasksModule));
    tasks = actingAs(moduleRef.get(TasksService), caller);
    orgId = polis.organization();
    projectId = polis.project(orgId);
    const agents = actingAs(moduleRef.get(AgentsService), caller);
    const versions = actingAs(moduleRef.get(AgentVersionsService), caller);
    agentId = (await agents.create(orgId, { name: 'Helper', description: '' }))
      .id;
    const version = await versions.create(orgId, agentId, versionBody);
    await versions.publish(orgId, agentId, version.id);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const create = (
    extra: { parentTaskId?: string; dependsOn?: string[] } = {},
  ) =>
    tasks
      .create(
        orgId,
        projectId,
        {
          title: 'Do it',
          instructions: 'Fix the bug',
          agentId,
          serviceAccountId: SERVICE_ACCOUNT,
          ...extra,
        },
        `key-${++key}`,
      )
      .then((result) => result.task);

  /** Drives a task the way the runner will, up to success. */
  async function runToSuccess(taskId: string) {
    for (const action of [
      'provision',
      'run',
      'verify',
      'deliver',
      'succeed',
    ] as const) {
      await tasks.transition(orgId, taskId, action, null, {
        // As the runner records it (artifacts are another library's).
        outcome: { primaryArtifactId: ARTIFACT, artifactIds: [ARTIFACT] },
      });
    }
  }

  const eventTypes = async () =>
    (
      (await moduleRef
        .get(DataSource)
        .query('SELECT message FROM outbox ORDER BY created_at, id')) as {
        message: {
          eventType: string;
          payload: { taskId: string; to?: string; reason?: string };
        };
      }[]
    ).map((row) => row.message);

  it('runs a task through its lifecycle, and unblocks what depended on it', async () => {
    const parent = await create();
    const first = await create({ parentTaskId: parent.id });
    const second = await create({
      parentTaskId: parent.id,
      dependsOn: [first.id],
    });
    expect(first.status).toBe('queued');
    expect(second.status).toBe('blocked');

    await runToSuccess(first.id);
    await expect(
      tasks.findById(orgId, projectId, first.id),
    ).resolves.toMatchObject({
      status: 'succeeded',
      finishedAt: expect.any(String),
      version: 6,
    });
    await expect(
      tasks.findById(orgId, projectId, second.id),
    ).resolves.toMatchObject({
      status: 'queued',
    });

    const events = await eventTypes();
    expect(
      events
        .filter((event) => event.payload.taskId === second.id)
        .map((event) => [
          event.eventType,
          event.payload.to,
          event.payload.reason,
        ]),
    ).toEqual([
      ['task.created', undefined, undefined],
      ['task.status-changed', 'queued', 'dependencies-met'],
    ]);
    expect(
      events
        .filter((event) => event.eventType === 'task.succeeded')
        .map((event) => event.payload),
    ).toEqual([
      expect.objectContaining({
        taskId: first.id,
        primaryArtifactId: ARTIFACT,
        artifactIds: [ARTIFACT],
      }),
    ]);
    await expect(
      tasks.findById(orgId, projectId, first.id),
    ).resolves.toMatchObject({ primaryArtifactId: ARTIFACT });
  });

  it('fails with a reason, and retries the same task', async () => {
    const task = await create();
    await tasks.transition(orgId, task.id, 'provision');
    await expect(tasks.transition(orgId, task.id, 'fail')).rejects.toThrow(
      'failure reason',
    );

    const failed = await tasks.transition(
      orgId,
      task.id,
      'fail',
      'infrastructure',
    );
    expect(failed).toMatchObject({
      status: 'failed',
      failureReason: 'infrastructure',
    });
    expect((await eventTypes()).map((event) => event.eventType)).toContain(
      'task.failed',
    );

    const retried = await tasks.retry(orgId, projectId, task.id);
    expect(retried).toMatchObject({
      id: task.id,
      status: 'queued',
      failureReason: null,
      attempt: 2,
      finishedAt: null,
    });
    await expect(tasks.retry(orgId, projectId, task.id)).rejects.toMatchObject({
      code: 'TASK_INVALID_TRANSITION',
    });
  });

  it('refuses transitions the lifecycle does not allow', async () => {
    const task = await create();
    await expect(
      tasks.transition(orgId, task.id, 'succeed'),
    ).rejects.toMatchObject({
      code: 'TASK_INVALID_TRANSITION',
    });
    await expect(tasks.transition(orgId, task.id, 'run')).rejects.toMatchObject(
      {
        code: 'TASK_INVALID_TRANSITION',
      },
    );
  });

  it('keeps a retried task blocked until its dependencies succeed again', async () => {
    const parent = await create();
    const first = await create({ parentTaskId: parent.id });
    const second = await create({
      parentTaskId: parent.id,
      dependsOn: [first.id],
    });
    await runToSuccess(first.id);
    await tasks.transition(orgId, second.id, 'provision');
    await tasks.transition(orgId, second.id, 'fail', 'agent_failed');

    // Its dependency succeeded, so the retry goes straight to queued.
    await expect(
      tasks.retry(orgId, projectId, second.id),
    ).resolves.toMatchObject({
      status: 'queued',
    });
  });
});
