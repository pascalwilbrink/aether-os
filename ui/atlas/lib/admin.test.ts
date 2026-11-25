import { describe, expect, it } from "vitest";

import { isAdmin } from "./admin";

describe("isAdmin", () => {
  it("lets owners and admins in, and no one else", () => {
    expect(isAdmin(["owner"])).toBe(true);
    expect(isAdmin(["member", "admin"])).toBe(true);
    expect(isAdmin(["member"])).toBe(false);
    expect(isAdmin(["viewer"])).toBe(false);
    expect(isAdmin([])).toBe(false);
  });
});
