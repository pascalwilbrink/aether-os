import { describe, expect, it } from "vitest";

import {
  contentTypeFor,
  downloadHref,
  formatBytes,
  inputFilesProblem,
  pickedFiles,
  PREVIEW_CSP,
  previewDocument,
  previewOf,
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

  it("previews images, HTML and text up to a size", () => {
    expect(previewOf("image/png", 1000)).toBe("image");
    expect(previewOf("image/svg+xml", 1000)).toBe("image");
    expect(previewOf("text/html; charset=utf-8", 1000)).toBe("html");
    expect(previewOf("text/markdown", 1000)).toBe("text");
    expect(previewOf("application/json", 1000)).toBe("text");
    expect(previewOf("application/pdf", 1000)).toBeNull();
    expect(previewOf("application/octet-stream", 10)).toBeNull();
    expect(previewOf("text/plain", 256 * 1024 + 1)).toBeNull();
    expect(previewOf("text/html", 2 * 1024 * 1024)).toBeNull();
  });

  it("puts a policy in front of HTML that loads nothing from outside", () => {
    const document = previewDocument("<h1>Hi</h1>");
    expect(
      document.startsWith(
        `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`,
      ),
    ).toBe(true);
    expect(document.endsWith("<h1>Hi</h1>")).toBe(true);
    expect(PREVIEW_CSP).toContain("default-src 'none'");
    expect(PREVIEW_CSP).not.toMatch(/https?:/);
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
