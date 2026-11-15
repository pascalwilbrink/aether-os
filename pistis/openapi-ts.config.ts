import { defineConfig } from '@hey-api/openapi-ts';

// Types and Zod schemas from Pistis's spec (docs/engineering.md). The output
// is committed and never edited by hand; regenerate with `pnpm generate:api`.
export default defineConfig({
  input: 'node_modules/@aether-os/contracts/pistis.openapi.yaml',
  output: {
    path: 'libs/core/src/api/generated',
    importFileExtension: '.js',
    clean: true,
  },
  plugins: ['@hey-api/typescript', 'zod'],
});
