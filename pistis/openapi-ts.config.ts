import { defineConfig } from '@hey-api/openapi-ts';

// Generated from the specs in @aether-os/contracts (docs/engineering.md); the
// output is committed and never edited by hand. Regenerate with
// `pnpm generate:api`.
export default defineConfig([
  // Pistis's own API: types and Zod schemas.
  {
    input: 'node_modules/@aether-os/contracts/pistis.openapi.yaml',
    output: {
      path: 'libs/core/src/api/generated',
      importFileExtension: '.js',
      clean: true,
    },
    plugins: ['@hey-api/typescript', 'zod'],
  },
  // Polis's API: a typed HTTP client, for memberships at token issuing.
  {
    input: 'node_modules/@aether-os/contracts/polis.openapi.yaml',
    output: {
      path: 'libs/core/src/clients/polis/generated',
      importFileExtension: '.js',
      clean: true,
    },
    plugins: ['@hey-api/typescript', '@hey-api/client-fetch', '@hey-api/sdk'],
  },
]);
