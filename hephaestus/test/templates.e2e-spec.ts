import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { createApp, MISSING_ID } from './app.js';
import { asMember, type Client } from './auth.js';
import type { FakePolis } from './fake-polis.js';
import { publishedAgent } from './agora.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';
const versionBody = {
  instructions: 'Be helpful.',
  model: { provider: 'anthropic', model: 'claude', temperature: 0.2 },
  capabilities: ['code'],
  tools: [],
  skills: [],
  runtime: {
    provider: 'local',
    executionMode: 'standard' as const,
    sandboxRequired: true,
  },
};

const TESTS_PASS = {
  key: 'tests-pass',
  description: 'The tests pass',
  check: { type: 'command', command: 'pnpm test' },
};
const CHANGELOG = {
  key: 'changelog',
  description: 'The changelog mentions the fix',
  check: { type: 'manual' },
};

describe('Task templates (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let projectId: string;
  let owner: Client;
  let agentId: string;
  let templates: string;
  let key = 0;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    owner = await asMember(app, orgId, ['owner']);
    templates = `/v1/organizations/${orgId}/task-templates`;

    const published = await publishedAgent(app, orgId, versionBody);
    agentId = published.agentId;
  });

  afterEach(async () => {
    await app.close();
  });

  /** The organization's "Fix a bug" template. */
  const fixBug = () =>
    owner
      .post(templates)
      .send({
        name: 'Fix a bug',
        description: 'From an issue',
        title: 'Fix {{issue}}',
        instructions: 'Fix the bug described in {{issue}}.',
        agentId,
        inputs: [{ name: 'issue', description: 'The issue' }],
        acceptanceCriteria: [TESTS_PASS],
        review: { artifactKinds: ['json'] },
      })
      .expect(201);

  const fromTemplate = (
    client: Client,
    templateId: string,
    body: Record<string, unknown>,
    project = projectId,
  ) =>
    client
      .post(
        `/v1/organizations/${orgId}/projects/${project}/task-templates/${templateId}/tasks`,
      )
      .set('idempotency-key', `key-${++key}`)
      .send({ serviceAccountId: SERVICE_ACCOUNT, ...body });

  it('keeps every version of a template, and what each one amounts to', async () => {
    const created = (await fixBug()).body;
    expect(created).toEqual({
      id: expect.any(String),
      organizationId: orgId,
      projectId: null,
      name: 'Fix a bug',
      description: 'From an issue',
      status: 'active',
      latestVersion: 1,
      createdBy: 'user-1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const v2 = await owner
      .post(`${templates}/${created.id}/versions`)
      .send({
        title: 'Fix {{issue}}',
        instructions: 'Fix {{issue}}, with a test that shows it.',
        agentId,
        inputs: [{ name: 'issue' }],
        acceptanceCriteria: [TESTS_PASS],
      })
      .expect(201);
    expect(v2.body).toMatchObject({ templateId: created.id, version: 2 });

    const versions = await owner
      .get(`${templates}/${created.id}/versions`)
      .expect(200);
    expect(
      versions.body.items.map((v: { version: number }) => v.version),
    ).toEqual([2, 1]);
    const v1 = await owner
      .get(`${templates}/${created.id}/versions/1`)
      .expect(200);
    expect(v1.body.effective).toEqual({
      title: 'Fix {{issue}}',
      description: 'Fix the bug described in {{issue}}.',
      instructions: 'Fix the bug described in {{issue}}.',
      requirements: [],
      expectedOutcome: null,
      constraints: [],
      deliverables: [],
      agentId,
      inputs: [{ name: 'issue', description: 'The issue', required: true }],
      acceptanceCriteria: [TESTS_PASS],
      review: { artifactKinds: ['json'] },
    });
    await owner
      .get(`${templates}/${created.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.latestVersion).toBe(2));

    // Placeholders need inputs; an unknown agent is a 404.
    const bad = await owner
      .post(`${templates}/${created.id}/versions`)
      .send({ title: 'Fix {{ticket}}', instructions: 'x', agentId })
      .expect(409);
    expect(bad.body.code).toBe('TASK_TEMPLATE_INVALID');
    await owner
      .post(`${templates}/${created.id}/versions`)
      .send({ title: 'x', instructions: 'x', agentId: MISSING_ID })
      .expect(404);
  });

  it('lets a project extend an organization template, adding to it', async () => {
    const org = (await fixBug()).body;
    const project = await owner
      .post(templates)
      .send({
        name: 'Fix a bug in the API',
        projectId,
        extends: { templateId: org.id, version: 1 },
        instructions: 'Also update the changelog.',
        acceptanceCriteria: [CHANGELOG],
      })
      .expect(201);
    expect(project.body.projectId).toBe(projectId);
    const effective = (
      await owner.get(`${templates}/${project.body.id}/versions/1`).expect(200)
    ).body.effective;
    expect(effective).toMatchObject({
      title: 'Fix {{issue}}',
      instructions:
        'Fix the bug described in {{issue}}.\n\nAlso update the changelog.',
      agentId,
      acceptanceCriteria: [TESTS_PASS, CHANGELOG],
    });

    // The project sees both; the organization's list only its own.
    const forProject = await owner
      .get(templates)
      .query({ projectId })
      .expect(200);
    expect(forProject.body.items.map((t: { id: string }) => t.id)).toEqual([
      project.body.id,
      org.id,
    ]);
    const orgWide = await owner.get(templates).expect(200);
    expect(orgWide.body.items.map((t: { id: string }) => t.id)).toEqual([
      org.id,
    ]);

    // It can't redefine the organization's criteria, and only project
    // templates extend.
    const weaker = await owner
      .post(`${templates}/${project.body.id}/versions`)
      .send({
        extends: { templateId: org.id, version: 1 },
        acceptanceCriteria: [{ ...TESTS_PASS, check: { type: 'manual' } }],
      })
      .expect(409);
    expect(weaker.body.code).toBe('TASK_TEMPLATE_INVALID');
    await owner
      .post(templates)
      .send({ name: 'Nested', extends: { templateId: org.id, version: 1 } })
      .expect(409);
  });

  it('creates tasks from a template version, with its inputs filled in', async () => {
    const org = (await fixBug()).body;
    const project = (
      await owner
        .post(templates)
        .send({
          name: 'Fix a bug in the API',
          projectId,
          extends: { templateId: org.id, version: 1 },
          acceptanceCriteria: [CHANGELOG],
        })
        .expect(201)
    ).body;

    const task = await fromTemplate(owner, project.id, {
      inputs: { issue: 'issue #42' },
      acceptanceCriteria: [
        {
          key: 'no-todo',
          description: 'No TODOs left',
          check: { type: 'command', command: '! grep -r TODO src' },
        },
      ],
      review: { artifactKinds: ['text'] },
    }).expect(201);
    expect(task.body).toMatchObject({
      title: 'Fix issue #42',
      instructions: 'Fix the bug described in issue #42.',
      agentId,
      taskTemplateId: project.id,
      taskTemplateVersion: 1,
      review: { artifactKinds: ['json', 'text'] },
      status: 'queued',
    });
    expect(
      task.body.acceptanceCriteria.map((c: { key: string; source: string }) => [
        c.key,
        c.source,
      ]),
    ).toEqual([
      ['tests-pass', 'template'],
      ['changelog', 'template'],
      ['no-todo', 'task'],
    ]);

    // Inputs as declared; criteria can't replace the template's.
    const missing = await fromTemplate(owner, project.id, {}).expect(409);
    expect(missing.body.code).toBe('TASK_TEMPLATE_INPUTS_INVALID');
    const replaced = await fromTemplate(owner, project.id, {
      inputs: { issue: '#1' },
      acceptanceCriteria: [{ ...TESTS_PASS, check: { type: 'manual' } }],
    }).expect(409);
    expect(replaced.body.code).toBe('TASK_CRITERIA_INVALID');

    // A pinned older version; another project can't use this project's.
    await owner
      .post(`${templates}/${org.id}/versions`)
      .send({
        title: 'New {{issue}}',
        instructions: '{{issue}}',
        agentId,
        inputs: [{ name: 'issue' }],
      })
      .expect(201);
    const pinned = await fromTemplate(owner, org.id, {
      version: 1,
      inputs: { issue: '#7' },
    }).expect(201);
    expect(pinned.body).toMatchObject({
      title: 'Fix #7',
      taskTemplateVersion: 1,
    });
    const otherProject = polis.project(orgId);
    await fromTemplate(
      owner,
      project.id,
      { inputs: { issue: '#1' } },
      otherProject,
    ).expect(404);

    // Archived: no new tasks.
    await owner.post(`${templates}/${org.id}/archive`).expect(200);
    const archived = await fromTemplate(owner, org.id, {
      inputs: { issue: '#8' },
    }).expect(409);
    expect(archived.body.code).toBe('TASK_TEMPLATE_ARCHIVED');
  });

  it('needs the template permissions at the template scope', async () => {
    await request(app.getHttpServer()).get(templates).expect(401);
    const org = (await fixBug()).body;

    // Organization-wide: owners and admins manage, members read.
    const member = await asMember(app, orgId, ['member'], {
      [projectId]: 'editor',
    });
    await member.get(`${templates}/${org.id}`).expect(200);
    await member
      .post(templates)
      .send({ name: 'Mine', title: 't', instructions: 'i', agentId })
      .expect(403);
    await member.post(`${templates}/${org.id}/archive`).expect(403);

    // A project's: its admins manage; editors read and create tasks from it.
    await member
      .post(templates)
      .send({ name: 'Mine', projectId, title: 't', instructions: 'i', agentId })
      .expect(403);
    const admin = await asMember(app, orgId, ['admin']);
    const projectTemplate = (
      await admin
        .post(templates)
        .send({
          name: 'Ours',
          projectId,
          title: 't',
          instructions: 'i',
          agentId,
        })
        .expect(201)
    ).body;
    await member.get(`${templates}/${projectTemplate.id}`).expect(200);
    await fromTemplate(member, projectTemplate.id, {}).expect(201);

    // Someone without a role in the project doesn't see it.
    const outsider = await asMember(app, orgId, ['member']);
    await outsider.get(`${templates}/${projectTemplate.id}`).expect(404);
    const viewer = await asMember(app, orgId, ['member'], {
      [projectId]: 'viewer',
    });
    await fromTemplate(viewer, projectTemplate.id, {}).expect(403);
  });
});
