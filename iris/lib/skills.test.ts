import { describe, expect, it } from "vitest";

import { formatBytes, skillFieldsOf, skillFilesFromForm, skillsFromForm, skillTemplate, versionChoices } from "./skills";

describe("skillFilesFromForm", () => {
  it("puts SKILL.md first and keeps the other files", () => {
    expect(
      skillFilesFromForm({ name: " code-review ", skillMd: "---\nname: code-review\n---" }, [
        { path: "SKILL.md", content: "old" },
        { path: "references/a.md", content: "a" },
      ]),
    ).toEqual({
      name: "code-review",
      files: [
        { path: "SKILL.md", content: "---\nname: code-review\n---" },
        { path: "references/a.md", content: "a" },
      ],
    });
  });

  it.each([
    [{ name: "Code Review", skillMd: "x" }, "A skill's name"],
    [{ name: "ok", skillMd: " " }, "Write the skill's SKILL.md."],
  ])("refuses %o", (fields, error) => {
    const result = skillFilesFromForm(fields);
    expect("error" in result && result.error).toContain(error);
  });

  it("starts a SKILL.md with front matter", () => {
    expect(skillTemplate("greet")).toMatch(/^---\nname: greet\ndescription: /);
  });
});

describe("skills on the version form", () => {
  it("round-trips a version's enabled skills", () => {
    const skills = [
      { name: "a", version: "2", enabled: true },
      { name: "b", version: "1", enabled: true },
    ];
    expect(skillsFromForm(skillFieldsOf([...skills, { name: "c", version: "1", enabled: false }]))).toEqual({
      skills,
    });
  });

  it("wants a version for a checked skill", () => {
    expect(skillsFromForm({ "skill:a": "on", "skillVersion:a": "" })).toEqual({ error: "Choose a version of a." });
  });

  it("offers every version, newest first", () => {
    expect(versionChoices({ latestVersion: 3 })).toEqual(["3", "2", "1"]);
    expect(formatBytes(2048)).toBe("2.0 KiB");
  });
});
