import 'reflect-metadata';

import { inject } from 'vitest';

import { initializeTransactions } from '@aether-os/krepis';

import { FakeUpstream, upstream } from './fake-upstream.js';

// Every test app connects to the run's Postgres container.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.NODE_ENV = 'test';
// The lowest allowed scrypt cost: real hashes, quickly.
process.env.PASSWORD_SCRYPT_COST = '14';
// Never called: test apps replace PolisDirectory (test/fake-polis-directory.ts).
process.env.POLIS_URL = 'http://polis.invalid';
process.env.PISTIS_ISSUER = 'http://127.0.0.1/oidc';
// An external OpenID Connect provider to sign in with (test/fake-upstream.ts).
await upstream.start();
process.env.PISTIS_UPSTREAM_PROVIDERS = JSON.stringify([
  {
    id: 'acme',
    name: 'Acme',
    issuer: upstream.issuer,
    clientId: FakeUpstream.CLIENT_ID,
    clientSecret: FakeUpstream.CLIENT_SECRET,
  },
]);
initializeTransactions();
