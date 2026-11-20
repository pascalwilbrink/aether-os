import 'reflect-metadata';

import { inject } from 'vitest';

import { initializeTransactions } from '@aether-os/krepis';

import { TEST_ACCESS_KEY, TEST_BUCKET, TEST_SECRET_KEY } from './storage.js';

// Every test app connects to the run's Postgres and RustFS containers.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.NODE_ENV = 'test';
process.env.S3_ENDPOINT = inject('storageEndpoint');
process.env.S3_BUCKET = TEST_BUCKET;
process.env.S3_ACCESS_KEY_ID = TEST_ACCESS_KEY;
process.env.S3_SECRET_ACCESS_KEY = TEST_SECRET_KEY;
process.env.S3_FORCE_PATH_STYLE = 'true';
process.env.FILE_MAX_BYTES = String(1024 * 1024);
// Test apps trust the run's test keys (test/tokens.ts) instead of Pistis.
const { tokens } = await import('./tokens.js');
process.env.PISTIS_ISSUER = tokens.issuer;
process.env.PISTIS_JWKS = JSON.stringify(tokens.jwks);
initializeTransactions();
