import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  checkSkillFolder,
  filesOfZip,
  skillFolderOf,
  skillNameOf,
  uploadedFilesOf,
  type PickedFile,
} from "./skill-upload";
import { skillFilesFromForm } from "./skills";

const SKILL_MD = "---\nname: code-review\ndescription: Reviews code.\n---\n";
const picked = (files: Record<string, string>): PickedFile[] =>
  Object.entries(files).map(([path, text]) => ({
    path,
    bytes: strToU8(text),
  }));

describe("skillFolderOf", () => {
  it("takes off the folder around everything, leaves hidden files out and puts SKILL.md first", () => {
    expect(
      skillFolderOf(
        picked({
          "code-review/scripts/run.sh": "echo hi",
          "code-review/SKILL.md": SKILL_MD,
          "code-review/.DS_Store": "",
          "code-review/.git/HEAD": "ref",
          "__MACOSX/code-review/._SKILL.md": "",
          "code-review/references/checklist.md": "- tests",
        }),
      ),
    ).toEqual({
      files: [
        { path: "SKILL.md", content: SKILL_MD },
        { path: "references/checklist.md", content: "- tests" },
        { path: "scripts/run.sh", content: "echo hi" },
      ],
      skipped: [
        "code-review/.DS_Store",
        "code-review/.git/HEAD",
        "__MACOSX/code-review/._SKILL.md",
      ],
    });
  });

  it("keeps paths as they are when SKILL.md is at the root, and accepts Windows separators", () => {
    const result = skillFolderOf(
      picked({ "SKILL.md": SKILL_MD, "docs\\a.md": "a", "./b.md": "b" }),
    );
    expect("files" in result && result.files.map((f) => f.path)).toEqual([
      "SKILL.md",
      "b.md",
      "docs/a.md",
    ]);
  });

  it.each([
    [{ "my-skill/README.md": "x" }, "no SKILL.md at its root"],
    [{ "a/SKILL.md": SKILL_MD, "b/x.md": "x" }, "no SKILL.md at its root"],
    [{ "SKILL.md": SKILL_MD, "my notes.md": "x" }, "no spaces"],
    [{}, "no files"],
  ])("refuses %o", (files, error) => {
    const result = skillFolderOf(picked(files));
    expect("error" in result && result.error).toContain(error);
  });

  it("refuses a file that isn't text", () => {
    const result = skillFolderOf([
      ...picked({ "SKILL.md": SKILL_MD }),
      { path: "logo.png", bytes: new Uint8Array([0x89, 0x50, 0xff, 0xfe]) },
    ]);
    expect("error" in result && result.error).toBe(
      "logo.png isn't a text file: a skill's files are text (UTF-8).",
    );
  });

  it("refuses more than 100 files or 1 MiB", () => {
    const many = Object.fromEntries(
      Array.from({ length: 101 }, (_, i) => [`f${i}.md`, "x"]),
    );
    const tooMany = skillFolderOf(picked({ "SKILL.md": SKILL_MD, ...many }));
    expect("error" in tooMany && tooMany.error).toContain("at most 100 files");
    const tooLarge = skillFolderOf(
      picked({ "SKILL.md": SKILL_MD, "big.md": "x".repeat(1024 * 1024) }),
    );
    expect("error" in tooLarge && tooLarge.error).toBe(
      "A skill is at most 1 MiB in all.",
    );
  });
});

describe("filesOfZip", () => {
  it("unpacks a zipped folder, hidden files left out", () => {
    const zip = zipSync({
      "code-review/": {},
      "code-review/SKILL.md": strToU8(SKILL_MD),
      "code-review/.env": strToU8("SECRET=1"),
    });
    const files = filesOfZip(zip);
    expect(Array.isArray(files) && skillFolderOf(files)).toEqual({
      files: [{ path: "SKILL.md", content: SKILL_MD }],
      skipped: ["code-review/.env"],
    });
    // The hidden file isn't unpacked.
    expect(
      Array.isArray(files) &&
        files.find((f) => f.path.endsWith(".env"))?.bytes.length,
    ).toBe(0);
  });

  it("stops at more than a skill holds, and refuses what isn't a .zip", () => {
    const zip = zipSync({
      "SKILL.md": strToU8(SKILL_MD),
      "big.md": new Uint8Array(1024 * 1024),
    });
    expect(filesOfZip(zip)).toEqual({
      error:
        "A skill has at most 100 files and 1 MiB in all; this .zip has more.",
    });
    expect(filesOfZip(strToU8("not a zip"))).toEqual({
      error: "That isn't a .zip Iris can open.",
    });
  });
});

describe("uploadedFilesOf", () => {
  it("reads and checks what the form sent", () => {
    expect(uploadedFilesOf(undefined)).toBeNull();
    expect(
      uploadedFilesOf(JSON.stringify([{ path: "SKILL.md", content: "x" }])),
    ).toEqual({ files: [{ path: "SKILL.md", content: "x" }] });
    expect(uploadedFilesOf("[{")).toHaveProperty("error");
    expect(uploadedFilesOf(JSON.stringify([{ path: 1 }]))).toHaveProperty(
      "error",
    );
  });
});

describe("checkSkillFolder", () => {
  it("refuses a path twice", () => {
    expect(
      checkSkillFolder([
        { path: "SKILL.md", content: "a" },
        { path: "SKILL.md", content: "b" },
      ]),
    ).toEqual({ error: "SKILL.md is there twice." });
  });
});

describe("skillNameOf", () => {
  it("reads the name from the front matter", () => {
    expect(skillNameOf(SKILL_MD)).toBe("code-review");
    expect(skillNameOf("---\nname: 'greet'\n---\n")).toBe("greet");
    expect(skillNameOf("# No front matter")).toBeUndefined();
  });
});

describe("skillFilesFromForm with an upload", () => {
  it("checks the uploaded files' paths", () => {
    const result = skillFilesFromForm({
      name: "code-review",
      skillMd: "x",
      files: JSON.stringify([{ path: "../etc/passwd", content: "x" }]),
    });
    expect("error" in result && result.error).toContain("no spaces");
  });

  it("takes the uploaded files in place of the kept ones, with the edited SKILL.md", () => {
    expect(
      skillFilesFromForm(
        {
          name: "code-review",
          skillMd: "edited",
          files: JSON.stringify([{ path: "scripts/new.sh", content: "new" }]),
        },
        [
          { path: "SKILL.md", content: "old" },
          { path: "references/old.md", content: "old" },
        ],
      ),
    ).toEqual({
      name: "code-review",
      files: [
        { path: "SKILL.md", content: "edited" },
        { path: "scripts/new.sh", content: "new" },
      ],
    });
  });
});
