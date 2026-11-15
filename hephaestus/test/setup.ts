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
initializeTransactions();
