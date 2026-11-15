import 'reflect-metadata';

import { inject } from 'vitest';

import { initializeTransactions } from '@aether-os/krepis';

// Every test app connects to the run's Postgres container.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.RABBITMQ_URL = inject('rabbitmqUrl');
// Never reached: tests replace PolisClient with FakePolis.
process.env.POLIS_URL = 'http://polis.invalid';
// Tests run the relay themselves.
process.env.OUTBOX_RELAY_INTERVAL_MS = '0';
process.env.NODE_ENV = 'test';
// Test apps trust the run's test keys (test/tokens.ts) instead of Pistis.
const { tokens } = await import('./tokens.js');
process.env.PISTIS_ISSUER = tokens.issuer;
process.env.PISTIS_JWKS = JSON.stringify(tokens.jwks);
// Never used: tests replace PolisClient, so Hephaestus asks Pistis for nothing.
process.env.PISTIS_CLIENT_SECRET = 'hephaestus-test-secret';
initializeTransactions();
