import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';

import { SkillsService } from '@hephaestus/skills';

import { createApp } from './app.js';
import { asMember } from './auth.js';
import { deliverAgoraEvent, PublishedSkill } from './agora.js';
import type { FakePolis } from './fake-polis.js';

const skillMd = (description: string) =>
  `---\nname: code-review\ndescription: ${description}\n---\n\n# Review\n`;

/** Hephaestus's copy of Agora's skills (libs/skills), kept from its events. */
describe('Skills, copied from Agora (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
  });

  afterEach(async () => {
    await app.close();
  });

  const row = async (skillId: string) =>
    (
      (await app
        .get(DataSource)
        .query(
          'SELECT name, description, status, latest_version, revision FROM skills WHERE id = $1',
          [skillId],
        )) as Record<string, unknown>[]
    )[0];

  it('keeps skills and every version from the events, for runs to read', async () => {
    const skill = await PublishedSkill.create(app, orgId, [
      { path: 'SKILL.md', content: skillMd('Reviews a change') },
      { path: 'scripts/check.sh', content: 'echo ok\n' },
    ]);
    await skill.publish([{ path: 'SKILL.md', content: skillMd('Better') }]);

    expect(await row(skill.skillId)).toEqual({
      name: 'code-review',
      description: 'Better',
      status: 'active',
      latest_version: 2,
      revision: 3,
    });
    const run = await app
      .get(SkillsService)
      .forRun(orgId, [{ name: 'code-review', version: '1', enabled: true }]);
    expect(run).toEqual([
      {
        name: 'code-review',
        version: 1,
        description: 'Reviews a change',
        files: [
          { path: 'SKILL.md', content: skillMd('Reviews a change') },
          { path: 'scripts/check.sh', content: 'echo ok\n' },
        ],
      },
    ]);

    await skill.archive();
    expect(await row(skill.skillId)).toMatchObject({
      status: 'archived',
      revision: 4,
    });
    // Archived skills' versions still run: agent versions pinned them.
    await expect(
      app
        .get(SkillsService)
        .forRun(orgId, [{ name: 'code-review', version: '2', enabled: true }]),
    ).resolves.toHaveLength(1);
  });

  it('ignores an event it has applied, and stores a late version without moving back', async () => {
    const skill = await PublishedSkill.create(app, orgId, [
      { path: 'SKILL.md', content: skillMd('One') },
    ]);
    await skill.publish([{ path: 'SKILL.md', content: skillMd('Two') }]);
    // Version 1's event again, late (revision 2 ≤ 3).
    await deliverAgoraEvent(app, {
      eventType: 'skill-version.published',
      aggregateId: skill.skillId,
      aggregateVersion: 2,
      organizationId: orgId,
      payload: {
        skillId: skill.skillId,
        skillVersionId: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
        version: {
          id: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
          skillId: skill.skillId,
          organizationId: orgId,
          name: 'code-review',
          version: 1,
          description: 'Old',
          files: [{ path: 'SKILL.md', content: skillMd('Old') }],
          fileCount: 1,
          sizeBytes: 1,
          createdBy: 'user-1',
          createdAt: new Date().toISOString(),
        },
      },
    });
    expect(await row(skill.skillId)).toMatchObject({
      description: 'Two',
      latest_version: 2,
      revision: 3,
    });
    const [kept] = await app
      .get(SkillsService)
      .forRun(orgId, [{ name: 'code-review', version: '1', enabled: true }]);
    expect(kept.description).toBe('One');
  });

  it('retries an event about a skill it has not got yet', async () => {
    await expect(
      deliverAgoraEvent(app, {
        eventType: 'skill.archived',
        aggregateId: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c',
        aggregateVersion: 2,
        organizationId: orgId,
        payload: { skillId: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c' },
      }),
    ).rejects.toThrow("isn't in Hephaestus's copy yet");
  });

  it('serves no skills API any more: Agora does', async () => {
    const owner = await asMember(app, orgId, ['owner']);
    await owner.get(`/v1/organizations/${orgId}/skills`).expect(404);
    await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/skills`)
      .expect(404);
  });
});
