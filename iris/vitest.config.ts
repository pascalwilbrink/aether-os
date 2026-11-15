import { defineConfig } from "vitest/config";

// Unit tests for Iris's server-side logic (lib/**/*.test.ts); no browser.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
