import { describe, expect, it } from "vitest";

import { downloadHref, formatBytes } from "./files";

describe("files", () => {
  it("formats sizes for people", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
    expect(formatBytes(3 * 1024 ** 4)).toBe("3072 GB");
  });

  it("downloads through Iris", () => {
    expect(downloadHref("o", "p", "f")).toBe("/orgs/o/projects/p/files/f/download");
  });
});
