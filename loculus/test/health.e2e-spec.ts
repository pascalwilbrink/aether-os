import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { ObjectStorage, S3ObjectStorage } from '@loculus/files';

import { createApp } from './app.js';

interface Report {
  status: string;
  checks: Record<string, Record<string, unknown>>;
}

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app.close();
  });

  it('checks the database and the object store', async () => {
    app = await createApp();
    const { body } = await request(app.getHttpServer()).get('/health');
    const report = body as Report;
    expect(report.checks.database).toEqual(
      expect.objectContaining({ status: 'up', required: true }),
    );
    expect(report.checks.storage).toEqual(
      expect.objectContaining({ status: 'up', required: true }),
    );
    expect(report.checks.storage.bucket).toEqual(expect.any(String));
    // No RabbitMQ in Loculus.
    expect(report.checks.rabbitmq).toBeUndefined();
  });

  it("is down, with a 503, when the object store doesn't answer", async () => {
    app = await createApp((builder) =>
      builder.overrideProvider(ObjectStorage).useValue(
        new S3ObjectStorage({
          endpoint: 'http://127.0.0.1:9',
          region: 'us-east-1',
          bucket: 'loculus-test',
          credentials: { accessKeyId: 'x', secretAccessKey: 'y' },
          forcePathStyle: true,
        }),
      ),
    );
    const { body } = await request(app.getHttpServer())
      .get('/health')
      .expect(503);
    expect((body as Report).status).toBe('down');
    expect((body as Report).checks.storage).toEqual(
      expect.objectContaining({ status: 'down', required: true }),
    );
  });
});
