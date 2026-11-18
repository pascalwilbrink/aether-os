import 'reflect-metadata';

import { inject } from 'vitest';

import { initializeTransactions } from '@aether-os/krepis';

import { APP_ID } from './fake-github.js';
import { github } from './github.js';

// Every test app connects to the run's Postgres container.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.RABBITMQ_URL = inject('rabbitmqUrl');
// Tests run the relay themselves (OutboxRelay.relayBatch).
process.env.OUTBOX_RELAY_INTERVAL_MS = '0';
process.env.NODE_ENV = 'test';
// Test apps trust the run's test keys (test/tokens.ts) instead of Pistis.
const { tokens } = await import('./tokens.js');
process.env.PISTIS_ISSUER = tokens.issuer;
process.env.PISTIS_JWKS = JSON.stringify(tokens.jwks);
process.env.PISTIS_CLIENT_SECRET = 'not-used-polis-is-faked';
process.env.POLIS_URL = 'http://polis.invalid';
process.env.IRIS_URL = 'https://iris.test';

// A GitHub in the test process, for this file's tests.
process.env.GITHUB_APP_ID = APP_ID;
process.env.GITHUB_APP_SLUG = 'aether-os-test';
process.env.GITHUB_CLIENT_ID = 'Iv1.test';
process.env.GITHUB_URL = github.url;
process.env.GITHUB_API_URL = `${github.url}/api/v3`;
// The secret store is faked (test/app.ts); these only satisfy validation.
process.env.OPENBAO_ADDR = 'http://openbao.invalid';
process.env.OPENBAO_TOKEN = 'not-used';
initializeTransactions();
