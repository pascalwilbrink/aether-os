import 'reflect-metadata';

import { inject } from 'vitest';

import { initializeTransactions } from '@aether-os/krepis';

// Every test app connects to the run's Postgres and RabbitMQ containers.
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
process.env.LOCULUS_URL = 'http://loculus.invalid';
// Tests index documents themselves (DocumentIndexer.drain).
process.env.INDEXER_INTERVAL_MS = '0';
initializeTransactions();
