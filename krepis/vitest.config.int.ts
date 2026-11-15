import { defineConfig } from 'vitest/config';

// Integration tests against a real Postgres (Testcontainers; needs Docker).
export default defineConfig({
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.int-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 120_000,
  },
});
