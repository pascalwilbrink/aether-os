import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Each test app gets a fresh in-memory database.
    env: { DATABASE_PATH: ':memory:' },
  },
});
