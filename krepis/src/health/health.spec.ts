import 'reflect-metadata';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Injectable, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureHttpApp } from '../http/http-app.js';

import { httpCheck, openBaoCheck, serviceCheck } from './checks.js';
import { HealthRegistry, type HealthCheck } from './health-check.js';
import { HealthModule } from './health.module.js';

const state = { storageUp: true, polisUp: true };

@Injectable()
class StorageHealth {
  constructor(health: HealthRegistry) {
    health.register({
      name: 'storage',
      check: () =>
        state.storageUp
          ? Promise.resolve({ bucket: 'files' })
          : Promise.reject(new Error('bucket files is missing')),
    });
  }
}

@Module({ providers: [StorageHealth] })
class FilesModule {}

describe('HealthModule', () => {
  let app: INestApplication;
  let peer: Server;
  let peerUrl: string;
  const slow: HealthCheck = {
    name: 'slow',
    required: false,
    timeoutMs: 50,
    check: () => new Promise(() => undefined),
  };

  beforeAll(async () => {
    peer = createServer((req, res) => {
      if (req.url === '/health/live' && state.polisUp) {
        res.writeHead(200).end('{"status":"ok"}');
      } else if (req.url === '/v1/sys/health') {
        res.writeHead(503).end();
      } else {
        res.writeHead(503).end();
      }
    });
    await new Promise<void>((resolve) => peer.listen(0, resolve));
    peerUrl = `http://127.0.0.1:${(peer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => peer.close(resolve));
  });

  beforeEach(async () => {
    state.storageUp = true;
    state.polisUp = true;
    const moduleRef = await Test.createTestingModule({
      imports: [
        HealthModule.forRoot({
          service: 'loculus',
          checks: () => [serviceCheck('polis', peerUrl), slow],
        }),
        FilesModule,
      ],
    }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers /health/live without checking anything', async () => {
    state.storageUp = false;
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200, { status: 'ok', service: 'loculus' });
  });

  it('is degraded, still 200, when a check that is not required fails', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(body).toEqual({
      status: 'degraded',
      service: 'loculus',
      checks: {
        storage: expect.objectContaining({
          status: 'up',
          required: true,
          bucket: 'files',
        }),
        polis: expect.objectContaining({
          status: 'up',
          required: false,
          httpStatus: 200,
        }),
        slow: expect.objectContaining({
          status: 'down',
          required: false,
          error: 'no answer in 50 ms',
        }),
      },
    });
  });

  it('is down, 503, when a required check fails', async () => {
    state.storageUp = false;
    state.polisUp = false;
    const { body } = await request(app.getHttpServer())
      .get('/health')
      .expect(503);
    expect(body.status).toBe('down');
    expect(body.checks.storage).toEqual(
      expect.objectContaining({
        status: 'down',
        error: 'bucket files is missing',
      }),
    );
    expect(body.checks.polis).toEqual(
      expect.objectContaining({ status: 'down', error: 'answered HTTP 503' }),
    );
  });

  it('says why OpenBao is down, and when a server does not answer', async () => {
    const signal = AbortSignal.timeout(1000);
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise((resolve) => closed.close(resolve));
    await expect(openBaoCheck(peerUrl).check(signal)).rejects.toThrow('sealed');
    await expect(
      httpCheck('gone', `http://127.0.0.1:${port}/`).check(signal),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
