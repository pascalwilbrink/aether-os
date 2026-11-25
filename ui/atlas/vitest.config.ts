import { defineConfig } from "vitest/config";

// Unit tests for Atlas's logic (lib/**/*.test.ts); no browser.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
