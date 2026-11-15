import { defineConfig } from 'vitest/config';

// Integration tests against real Postgres and RabbitMQ (Testcontainers; needs Docker).
export default defineConfig({
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.int-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // One database for the run: files take turns.
    fileParallelism: false,
    hookTimeout: 120_000,
  },
});
