import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { createApp, memberAgent, operatorAgent } from './app.js';
import { FakePolisDirectory } from './fake-polis-directory.js';

const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const OTHER_ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5e';

describe("An organization's people (e2e)", () => {
  let polis: FakePolisDirectory;
  let app: INestApplication<App>;

  beforeEach(async () => {
    polis = new FakePolisDirectory()
      .addOrganization(ORG)
      .addOrganization(OTHER_ORG);
    app = await createApp(polis);
  });

  afterEach(async () => {
    await app.close();
  });

  const createUser = async (displayName: string, email: string | null) =>
    (
      await (
        await operatorAgent(app)
      )
        .post('/v1/users')
        .send({
          displayName,
          email,
          password: {
            login: displayName.toLowerCase().replace(' ', '.'),
            password: 'correct horse battery',
          },
        })
        .expect(201)
    ).body as { id: string };

  it('lists the members, with their profile, and only members', async () => {
    const ada = await createUser('Ada Lovelace', 'ada@example.com');
    const grace = await createUser('Grace Hopper', null);
    const outsider = await createUser('Someone else', 'else@example.com');
    polis
      .addMember(ada.id, ORG, ['owner'])
      .addMember(grace.id, ORG, ['viewer'])
      .addMember(outsider.id, OTHER_ORG, ['owner'])
      // A member Pistis doesn't know (yet) is left out.
      .addMember('0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aff', ORG, ['member']);

    const viewer = await memberAgent(app, ORG, ['viewer'], grace.id);
    const res = await viewer.get(`/v1/organizations/${ORG}/users`).expect(200);
    expect(res.body).toEqual({
      items: [
        {
          id: grace.id,
          displayName: 'Grace Hopper',
          email: null,
          status: 'active',
        },
        {
          id: ada.id,
          displayName: 'Ada Lovelace',
          email: 'ada@example.com',
          status: 'active',
        },
      ],
      nextCursor: null,
    });
  });

  it('needs a token for the organization with member:read', async () => {
    await request(app.getHttpServer())
      .get(`/v1/organizations/${ORG}/users`)
      .expect(401);
    const elsewhere = await memberAgent(app, OTHER_ORG, ['owner']);
    await elsewhere.get(`/v1/organizations/${ORG}/users`).expect(404);
    const operator = await operatorAgent(app);
    await operator.get(`/v1/organizations/${ORG}/users`).expect(403);
  });
});
