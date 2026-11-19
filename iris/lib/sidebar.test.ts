import { describe, expect, it } from "vitest";

import { initials, projectColor, projectOf, roleLabel, sectionOf, statusLine, themeOf } from "./sidebar";

const ORG = "0193a1b2-c3d4-7e5f-8a9b-000000000001";
const PROJECT = "0193a1b2-c3d4-7e5f-8a9b-000000000003";

describe("sidebar helpers", () => {
  it("makes initials", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Ada Byron Lovelace")).toBe("AL");
    expect(initials("acme")).toBe("A");
    expect(initials("  ")).toBe("?");
  });

  it("gives each project a stable colour", () => {
    expect(projectColor(PROJECT)).toBe(projectColor(PROJECT));
    expect(projectColor(PROJECT)).toMatch(/^bg-[a-z]+-500$/);
  });

  it("names the highest role", () => {
    expect(roleLabel(["member", "owner"])).toBe("Owner");
    expect(roleLabel(["viewer"])).toBe("Viewer");
    expect(roleLabel([])).toBeNull();
  });

  it("finds the section and project of a page", () => {
    const base = `/orgs/${ORG}`;
    expect(sectionOf(base, ORG)).toBe("home");
    expect(sectionOf(`${base}/notifications`, ORG)).toBe("inbox");
    expect(sectionOf(`${base}/projects/${PROJECT}/tasks/x`, ORG)).toBe("projects");
    expect(sectionOf(`${base}/projects/${PROJECT}/templates/x`, ORG)).toBe("templates");
    expect(sectionOf(`${base}/agents/new`, ORG)).toBe("agents");
    expect(sectionOf(`${base}/skills/x`, ORG)).toBe("agents");
    expect(sectionOf(`${base}/members`, ORG)).toBe("members");
    for (const page of ["settings", "budget", "model-keys", "tool-servers", "github"]) {
      expect(sectionOf(`${base}/${page}`, ORG)).toBe("settings");
    }
    expect(projectOf(`${base}/projects/${PROJECT}/automations/new`, ORG)).toBe(PROJECT);
    expect(projectOf(`${base}/agents`, ORG)).toBeNull();
  });

  it("says whether everything answered", () => {
    expect(statusLine([])).toEqual({ ok: true, text: "All systems operational" });
    expect(statusLine(["Kerykes"])).toEqual({ ok: false, text: "Kerykes is unreachable" });
    expect(statusLine(["Kairos", "Kerykes"]).text).toBe("2 services unreachable");
  });

  it("reads a stored theme", () => {
    expect(themeOf("dark")).toBe("dark");
    expect(themeOf("light")).toBe("light");
    expect(themeOf(null)).toBe("system");
    expect(themeOf("purple")).toBe("system");
  });
});
