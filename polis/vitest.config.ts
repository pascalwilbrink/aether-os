import { defineConfig } from 'vitest/config';

// Unit tests: pure modules (state transitions, mappers, configuration), no
// database. Services are tested against Postgres in test:e2e.
export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['libs/**/*.spec.ts', 'src/**/*.spec.ts'],
  },
});
