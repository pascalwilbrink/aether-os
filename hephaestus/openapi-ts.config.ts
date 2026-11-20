import { defineConfig } from '@hey-api/openapi-ts';

// Generated from the specs in @aether-os/contracts (docs/engineering.md); the
// output is committed and never edited by hand. Regenerate with
// `pnpm generate:api`.
export default defineConfig([
  // Hephaestus's own API: types and Zod schemas.
  {
    input: 'node_modules/@aether-os/contracts/hephaestus.openapi.yaml',
    output: {
      path: 'libs/core/src/api/generated',
      importFileExtension: '.js',
      clean: true,
    },
    plugins: ['@hey-api/typescript', 'zod'],
  },
  // Polis's API: a typed HTTP client, used behind PolisClient.
  {
    input: 'node_modules/@aether-os/contracts/polis.openapi.yaml',
    output: {
      path: 'libs/core/src/clients/polis/generated',
      importFileExtension: '.js',
      clean: true,
    },
    plugins: ['@hey-api/typescript', '@hey-api/client-fetch', '@hey-api/sdk'],
  },
  // Proxenos's API: repository tokens for tasks (docs/git.md).
  {
    input: 'node_modules/@aether-os/contracts/proxenos.openapi.yaml',
    output: {
      path: 'libs/core/src/clients/proxenos/generated',
      importFileExtension: '.js',
      clean: true,
    },
    plugins: ['@hey-api/typescript', '@hey-api/client-fetch', '@hey-api/sdk'],
  },
  // Loculus's API: files a task produces (docs/files.md).
  {
    input: 'node_modules/@aether-os/contracts/loculus.openapi.yaml',
    output: {
      path: 'libs/core/src/clients/loculus/generated',
      importFileExtension: '.js',
      clean: true,
    },
    plugins: ['@hey-api/typescript', '@hey-api/client-fetch', '@hey-api/sdk'],
  },
]);
