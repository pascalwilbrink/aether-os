import { describe, expect, it } from "vitest";

import {
  contentTypeFor,
  downloadHref,
  formatBytes,
  inputFilesProblem,
  pickedFiles,
} from "./files";

describe("files", () => {
  it("formats sizes for people", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
    expect(formatBytes(3 * 1024 ** 4)).toBe("3072 GB");
  });

  it("downloads through Iris", () => {
    expect(downloadHref("o", "p", "f")).toBe(
      "/orgs/o/projects/p/files/f/download",
    );
  });

  it("takes the files a task starts from, within limits", () => {
    const empty = { name: "", size: 0 };
    const brief = { name: "brief.md", size: 10 };
    expect(pickedFiles([empty, brief, "text"])).toEqual([brief]);
    expect(inputFilesProblem([brief])).toBeNull();
    expect(inputFilesProblem(Array.from({ length: 21 }, () => brief))).toBe(
      "A task starts from at most 20 files.",
    );
    expect(
      inputFilesProblem([{ name: "big.zip", size: 26 * 1024 * 1024 }]),
    ).toBe("big.zip is 26 MB; a task's files are at most 25 MB.");
    expect(inputFilesProblem([{ name: "a\nb", size: 1 }])).toContain(
      "isn't a name",
    );
  });

  it("types files as Loculus takes them", () => {
    expect(contentTypeFor("text/markdown")).toBe("text/markdown");
    expect(contentTypeFor("")).toBe("application/octet-stream");
    expect(contentTypeFor("text/plain;charset=UTF-8")).toBe(
      "application/octet-stream",
    );
  });
});
