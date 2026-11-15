import 'reflect-metadata';

import { inject } from 'vitest';

import { initializeTransactions } from '@aether-os/krepis';

// Every test app connects to the run's Postgres container.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.NODE_ENV = 'test';
initializeTransactions();
