import { describe, expect, it } from "vitest";

import { newProjectRequest, showArchived, slugify } from "./projects";

describe("project helpers", () => {
  it("suggests a slug from a name", () => {
    expect(slugify("Billing API v2!")).toBe("billing-api-v2");
    expect(slugify("  Café  Crème ")).toBe("cafe-creme");
    expect(slugify("--Web__app--")).toBe("web-app");
    expect(slugify("✨")).toBe("");
    expect(slugify("a".repeat(70))).toHaveLength(63);
  });

  it("checks the fields before asking Polis", () => {
    expect(newProjectRequest({ name: " Web app ", slug: "web-app", description: " The site " })).toEqual({
      request: { name: "Web app", slug: "web-app", description: "The site" },
    });
    expect(newProjectRequest({ name: "", slug: "web-app", description: "" })).toEqual({
      error: "Give the project a name.",
    });
    for (const slug of ["ab", "Web-app", "web--app", "-web", "web app"]) {
      expect(newProjectRequest({ name: "Web", slug, description: "" })).toHaveProperty("error");
    }
    expect(newProjectRequest({ name: "Web", slug: "web", description: "x".repeat(2001) })).toHaveProperty("error");
  });

  it("shows archived projects only when asked", () => {
    expect(showArchived(undefined)).toBe(false);
    expect(showArchived("all")).toBe(true);
  });
});
