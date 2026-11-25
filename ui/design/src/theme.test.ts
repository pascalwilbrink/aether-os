import { describe, expect, it } from "vitest";

import { themeOf, themeScript } from "./theme.js";

describe("theme", () => {
  it("reads a stored theme, the system's otherwise", () => {
    expect(themeOf("dark")).toBe("dark");
    expect(themeOf("light")).toBe("light");
    expect(themeOf(null)).toBe("system");
    expect(themeOf("purple")).toBe("system");
  });

  it("writes a script that reads the given key", () => {
    expect(themeScript("iris-theme")).toContain('localStorage.getItem("iris-theme")');
  });
});
