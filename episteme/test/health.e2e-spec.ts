import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { createApp } from './app.js';

describe('Episteme (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    ({ app } = await createApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('runs', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });

  it('checks its database, RabbitMQ and Pistis', async () => {
    // RabbitMQ connects in the background and Pistis isn't running in
    // tests; neither is required, so Episteme still answers.
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(response.body).toMatchObject({
      service: 'episteme',
      checks: {
        database: { status: 'up', required: true },
        rabbitmq: { required: false },
        pistis: { required: false },
      },
    });
  });
});
