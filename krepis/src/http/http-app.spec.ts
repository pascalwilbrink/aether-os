import 'reflect-metadata';

import {
  Body,
  Controller,
  Get,
  type INestApplication,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsInt, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import request from 'supertest';

import { DomainError } from '../error/domain-error.js';
import { InvalidCursorError } from '../pagination/cursor.js';
import { configureHttpApp } from './http-app.js';
import { PaginationQuery } from './page.query.js';

class ThingArchivedError extends DomainError {
  constructor() {
    super('Thing t-1 is archived.', 'THING_ARCHIVED');
  }
}

class Owner {
  @IsString()
  @MinLength(1)
  name: string;
}

class CreateThing {
  @IsString()
  @MinLength(1)
  name: string;

  @IsInt()
  size: number;

  @ValidateNested()
  @Type(() => Owner)
  owner: Owner;
}

@Controller('things')
class ThingsController {
  @Get()
  list(@Query() query: PaginationQuery) {
    if (query.cursor === 'bad') {
      throw new InvalidCursorError();
    }
    return { items: [], nextCursor: null, limit: query.limit };
  }

  @Post()
  create(@Body() body: CreateThing) {
    return body;
  }

  @Get('archived')
  archived() {
    throw new ThingArchivedError();
  }

  @Get('missing')
  missing() {
    throw new NotFoundException('Thing t-2 not found');
  }

  @Get('broken')
  broken() {
    throw new Error('SELECT * FROM secrets failed');
  }
}

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}

describe('configureHttpApp', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThingsController, HealthController],
    }).compile();
    app = configureHttpApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('serves endpoints under /v1, and health checks without it', async () => {
    await http().get('/v1/things').expect(200);
    await http().get('/health').expect(200);

    // Outside the prefix, Nest leaves unknown paths to Express's own 404.
    await http().get('/things').expect(404);

    const res = await http().get('/v1/nothing').expect(404);
    expect(res.body).toMatchObject({
      code: 'NOT_FOUND',
      instance: '/v1/nothing',
    });
  });

  it('defaults and validates pagination', async () => {
    const res = await http().get('/v1/things').expect(200);
    expect(res.body.limit).toBe(50);

    await http().get('/v1/things?limit=0').expect(400);
    await http().get('/v1/things?limit=101').expect(400);
    await http().get('/v1/things?offset=1').expect(400);
  });

  it('turns domain errors into 409 problem details', async () => {
    const res = await http()
      .get('/v1/things/archived?x=1')
      .set(
        'traceparent',
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      )
      .expect(409)
      .expect('Content-Type', /application\/problem\+json/);

    expect(res.body).toEqual({
      type: 'urn:aether-os:problem:thing-archived',
      title: 'Thing archived',
      status: 409,
      detail: 'Thing t-1 is archived.',
      instance: '/v1/things/archived',
      code: 'THING_ARCHIVED',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      errors: [],
    });
  });

  it('reports each invalid body field with a JSON Pointer', async () => {
    const res = await http()
      .post('/v1/things')
      .send({ size: 'big', owner: { name: '' }, extra: true })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(res.body).toMatchObject({
      type: 'urn:aether-os:problem:validation-failed',
      status: 400,
      code: 'VALIDATION_FAILED',
      traceId: null,
    });
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pointer: '/name',
          parameter: null,
          code: 'REQUIRED',
        }),
        expect.objectContaining({ pointer: '/size', code: 'INVALID' }),
        expect.objectContaining({ pointer: '/owner/name', code: 'INVALID' }),
        expect.objectContaining({ pointer: '/extra', code: 'UNKNOWN_FIELD' }),
      ]),
    );
    expect(res.body.errors).toHaveLength(4);
  });

  it('names invalid query parameters', async () => {
    const res = await http().get('/v1/things?limit=abc').expect(400);

    expect(res.body.errors).toEqual([
      expect.objectContaining({
        pointer: null,
        parameter: 'limit',
        code: 'INVALID',
      }),
    ]);
  });

  it('maps an invalid cursor to 400 INVALID_CURSOR', async () => {
    const res = await http().get('/v1/things?cursor=bad').expect(400);

    expect(res.body).toMatchObject({
      code: 'INVALID_CURSOR',
      type: 'urn:aether-os:problem:invalid-cursor',
    });
  });

  it('keeps the message of Nest HTTP exceptions', async () => {
    const res = await http().get('/v1/things/missing').expect(404);

    expect(res.body).toMatchObject({
      code: 'NOT_FOUND',
      title: 'Resource not found',
      detail: 'Thing t-2 not found',
    });
  });

  it('hides internals of unexpected errors', async () => {
    const res = await http().get('/v1/things/broken').expect(500);

    expect(res.body).toMatchObject({
      code: 'INTERNAL',
      detail: 'An unexpected error occurred.',
    });
    expect(JSON.stringify(res.body)).not.toContain('secrets');
  });

  it('answers a malformed JSON body with 400 problem details', async () => {
    const res = await http()
      .post('/v1/things')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('ignores a malformed traceparent', async () => {
    const res = await http()
      .get('/v1/things/missing')
      .set('traceparent', 'nonsense')
      .expect(404);

    expect(res.body.traceId).toBeNull();
  });
});
