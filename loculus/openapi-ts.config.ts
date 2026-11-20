import { defineConfig } from '@hey-api/openapi-ts';

// Generated from the spec in @aether-os/contracts (docs/engineering.md); the
// output is committed and never edited by hand. Regenerate with
// `pnpm generate:api`.
export default defineConfig([
  // Loculus's own API: types and Zod schemas.
  {
    input: 'node_modules/@aether-os/contracts/loculus.openapi.yaml',
    output: {
      path: 'libs/core/src/api/generated',
      importFileExtension: '.js',
      clean: true,
    },
    plugins: ['@hey-api/typescript', 'zod'],
  },
]);
