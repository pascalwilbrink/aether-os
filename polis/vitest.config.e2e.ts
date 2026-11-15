import { defineConfig } from 'vitest/config';

// Integration tests (services with their real repositories, libs/**/*.int-spec.ts)
// and e2e tests (the HTTP API, test/*.e2e-spec.ts), against Postgres in a
// container started once per run (Testcontainers; needs Docker).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['libs/**/*.int-spec.ts', 'test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // One database for the run, emptied before each test.
    fileParallelism: false,
    hookTimeout: 120_000,
  },
});
