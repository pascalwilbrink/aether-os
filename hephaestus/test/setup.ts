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
// Sandbox proxies come from Docker Hub's mirror (no rate limit on CI).
// Test tool servers (test/fake-tool-server.ts) listen on 127.0.0.1.
process.env.TOOL_SERVER_ALLOW_PRIVATE = 'true';
process.env.MODEL_ENDPOINT_ALLOW_PRIVATE = 'true';
process.env.SANDBOX_PROXY_IMAGE = 'mirror.gcr.io/library/node:22-alpine';
// Test apps trust the run's test keys (test/tokens.ts) instead of Pistis.
const { tokens } = await import('./tokens.js');
process.env.PISTIS_ISSUER = tokens.issuer;
process.env.PISTIS_JWKS = JSON.stringify(tokens.jwks);
// Never used: tests replace PolisClient, so Hephaestus asks Pistis for nothing.
process.env.PISTIS_CLIENT_SECRET = 'hephaestus-test-secret';
initializeTransactions();
