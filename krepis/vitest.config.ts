import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig.json excludes specs (they aren't built), so Vite wouldn't pick
  // up its decorator settings for them; set them here.
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
