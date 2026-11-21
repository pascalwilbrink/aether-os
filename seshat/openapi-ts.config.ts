import { defineConfig } from '@hey-api/openapi-ts';

// Generated from the specs in @aether-os/contracts (docs/engineering.md); the
// output is committed and never edited by hand. Regenerate with
// `pnpm generate:api`.
export default defineConfig([
  // Seshat's own API: types and Zod schemas.
  {
    input: 'node_modules/@aether-os/contracts/seshat.openapi.yaml',
    output: {
      path: 'libs/core/src/api/generated',
      importFileExtension: '.js',
      clean: true,
    },
    plugins: ['@hey-api/typescript', 'zod'],
  },
  // Loculus's API: a typed HTTP client, used behind DocumentFiles (reading
  // a document's bytes to index it).
  {
    input: 'node_modules/@aether-os/contracts/loculus.openapi.yaml',
    output: {
      path: 'libs/core/src/clients/loculus/generated',
      importFileExtension: '.js',
      clean: true,
    },
    plugins: ['@hey-api/typescript', '@hey-api/client-fetch', '@hey-api/sdk'],
  },
  // Pylon's API: embeddings (docs/pylon.md).
  {
    input: 'node_modules/@aether-os/contracts/pylon.openapi.yaml',
    output: {
      path: 'libs/core/src/clients/pylon/generated',
      importFileExtension: '.js',
      clean: true,
    },
    plugins: ['@hey-api/typescript', '@hey-api/client-fetch', '@hey-api/sdk'],
  },
  // Proxenos's API: a linked repository's files and blobs, used behind
  // RepositoryFiles (repository documents, docs/knowledge.md).
  {
    input: 'node_modules/@aether-os/contracts/proxenos.openapi.yaml',
    output: {
      path: 'libs/core/src/clients/proxenos/generated',
      importFileExtension: '.js',
      clean: true,
    },
    plugins: ['@hey-api/typescript', '@hey-api/client-fetch', '@hey-api/sdk'],
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
]);
