import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';

import { createApp } from './app.js';

interface Report {
  status: string;
  service: string;
  checks: Record<string, { status: string; required: boolean; error?: string }>;
}

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  /** /health until RabbitMQ is connected (it connects in the background). */
  const settled = async (): Promise<request.Response> => {
    for (let i = 0; ; i++) {
      const response = await request(app.getHttpServer()).get('/health');
      const body = response.body as Report;
      if (body.checks.rabbitmq?.status === 'up' || i === 50) return response;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  it('answers /health/live without a token', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200, { status: 'ok', service: 'polis' });
  });

  it('checks the database, RabbitMQ and Pistis', async () => {
    const response = await settled();
    const body = response.body as Report;
    expect(body.service).toBe('polis');
    expect(body.checks.database).toEqual(
      expect.objectContaining({ status: 'up', required: true }),
    );
    expect(body.checks.rabbitmq).toEqual(
      expect.objectContaining({ status: 'up', required: false }),
    );
    // The tests' issuer runs nowhere: Pistis is down, Polis only degraded.
    expect(body.checks.pistis).toEqual(
      expect.objectContaining({ status: 'down', required: false }),
    );
    expect(body.status).toBe('degraded');
    expect(response.status).toBe(200);
  });

  it('is down, with a 503, without its database', async () => {
    await app.get(DataSource).destroy();
    const { body } = await request(app.getHttpServer())
      .get('/health')
      .expect(503);
    expect((body as Report).status).toBe('down');
    expect((body as Report).checks.database).toEqual(
      expect.objectContaining({ status: 'down', error: 'not connected' }),
    );
  });
});
