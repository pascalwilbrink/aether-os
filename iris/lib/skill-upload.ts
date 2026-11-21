import { unzipSync } from "fflate";

import type { SkillFile } from "./skills";

/** As Agora takes them: at most 100 files and 1 MiB in all. */
export const MAX_SKILL_FILES = 100;
export const MAX_SKILL_BYTES = 1024 * 1024;

/** Agora's `SkillFile.path`: plain segments, none starting with a dot. */
const PATH = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;

/** A file as picked in the browser: its path in the folder or .zip and its bytes. */
export interface PickedFile {
  path: string;
  bytes: Uint8Array;
}

/** A skill's folder read from an upload, and what was left out of it. */
export interface SkillUpload {
  files: SkillFile[];
  /** Hidden files and folders (`.git`, `.DS_Store`) and macOS's `__MACOSX`. */
  skipped: string[];
}

const utf8 = (text: string) => new TextEncoder().encode(text).length;

/** Never part of a skill: hidden files and folders, and what macOS adds to a .zip. */
export const isJunk = (path: string) =>
  path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX");

/**
 * A skill's files from a picked folder or an unzipped .zip: paths relative to
 * the skill (a single top folder around everything, as a folder pick or a
 * zipped folder has, is taken off), hidden files left out, each file text
 * (UTF-8), and within Agora's rules (`checkSkillFiles`), or what's wrong.
 * `SKILL.md` comes first.
 */
export function skillFolderOf(
  picked: readonly PickedFile[],
): SkillUpload | { error: string } {
  const skipped: string[] = [];
  let entries: PickedFile[] = [];
  for (const file of picked) {
    const path = file.path.replaceAll("\\", "/").replace(/^(\.\/|\/)+/, "");
    if (!path || path.endsWith("/")) continue; // a folder in a .zip
    if (isJunk(path)) {
      skipped.push(path);
      continue;
    }
    entries.push({ path, bytes: file.bytes });
  }
  const top = commonTopFolder(entries.map((entry) => entry.path));
  if (top && !entries.some((entry) => entry.path === "SKILL.md")) {
    entries = entries.map((entry) => ({
      ...entry,
      path: entry.path.slice(top.length + 1),
    }));
  }
  if (entries.length === 0) {
    return { error: "There are no files in it." };
  }
  if (entries.length > MAX_SKILL_FILES) {
    return {
      error: `A skill has at most ${MAX_SKILL_FILES} files; this has ${entries.length}.`,
    };
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const files: SkillFile[] = [];
  for (const entry of entries) {
    let content: string;
    try {
      content = decoder.decode(entry.bytes);
    } catch {
      return {
        error: `${entry.path} isn't a text file: a skill's files are text (UTF-8).`,
      };
    }
    if (content.includes("\u0000")) {
      return {
        error: `${entry.path} isn't a text file: a skill's files are text (UTF-8).`,
      };
    }
    files.push({ path: entry.path, content });
  }
  const checked = checkSkillFolder(files);
  if ("error" in checked) return checked;
  return { files: checked.files, skipped };
}

/**
 * The checks Iris makes on a skill's files before sending them (again on the
 * server, for what the browser sent): paths Agora takes, each once, at most
 * 100 files and 1 MiB, `SKILL.md` at the root. Agora checks SKILL.md's front
 * matter itself. Returns them with `SKILL.md` first, the rest by path.
 */
export function checkSkillFolder(
  files: readonly SkillFile[],
): { files: SkillFile[] } | { error: string } {
  if (files.length > MAX_SKILL_FILES) {
    return { error: `A skill has at most ${MAX_SKILL_FILES} files.` };
  }
  const paths = new Set<string>();
  let bytes = 0;
  for (const file of files) {
    if (file.path.length > 200 || !PATH.test(file.path)) {
      return {
        error: `${file.path}: a skill's paths are letters, digits, dots, hyphens and underscores (no spaces), at most 200 characters.`,
      };
    }
    if (paths.has(file.path)) {
      return { error: `${file.path} is there twice.` };
    }
    paths.add(file.path);
    bytes += utf8(file.content);
  }
  if (bytes > MAX_SKILL_BYTES) {
    return { error: "A skill is at most 1 MiB in all." };
  }
  if (!paths.has("SKILL.md")) {
    return {
      error:
        "There's no SKILL.md at its root: upload the skill's own folder, or a .zip of it.",
    };
  }
  return {
    files: [...files].sort((a, b) =>
      a.path === "SKILL.md"
        ? -1
        : b.path === "SKILL.md"
          ? 1
          : a.path.localeCompare(b.path),
    ),
  };
}

/**
 * The files in a .zip. Hidden files and folders aren't unpacked (they come
 * back empty, to be left out), and it stops
 * at more than a skill can hold (no zip bomb gets unpacked whole).
 */
export function filesOfZip(zip: Uint8Array): PickedFile[] | { error: string } {
  let count = 0;
  let bytes = 0;
  const junk: string[] = [];
  let tooLarge = false;
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(zip, {
      filter: (file) => {
        if (file.name.endsWith("/")) return false;
        if (isJunk(file.name)) {
          junk.push(file.name);
          return false;
        }
        count += 1;
        bytes += file.originalSize;
        if (count > MAX_SKILL_FILES || bytes > MAX_SKILL_BYTES) {
          tooLarge = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    return { error: "That isn't a .zip Iris can open." };
  }
  if (tooLarge) {
    return {
      error: `A skill has at most ${MAX_SKILL_FILES} files and 1 MiB in all; this .zip has more.`,
    };
  }
  // Hidden files come along unread, so skillFolderOf lists them as left out.
  return [
    ...Object.entries(unzipped).map(([path, content]) => ({
      path,
      bytes: content,
    })),
    ...junk.map((path) => ({ path, bytes: new Uint8Array() })),
  ];
}

/**
 * The files a form sent as JSON (an upload's, other than SKILL.md); null when
 * it sent none. `skillFilesFromForm` checks them with the SKILL.md.
 */
export function uploadedFilesOf(
  json: string | undefined,
): { files: SkillFile[] } | { error: string } | null {
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { error: "The uploaded files couldn't be read: upload them again." };
  }
  if (
    !Array.isArray(value) ||
    !value.every(
      (file) =>
        typeof file === "object" &&
        file !== null &&
        typeof file.path === "string" &&
        typeof file.content === "string",
    )
  ) {
    return { error: "The uploaded files couldn't be read: upload them again." };
  }
  return {
    files: value.map((file: SkillFile) => ({
      path: file.path,
      content: file.content,
    })),
  };
}

/** The skill's name in a SKILL.md's front matter, if it has one. */
export function skillNameOf(skillMd: string): string | undefined {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd)?.[1];
  const name = front
    ?.split(/\r?\n/)
    .map((line) => /^name:\s*(.*?)\s*$/.exec(line)?.[1])
    .find((value) => value !== undefined);
  return name?.replace(/^(["'])(.*)\1$/, "$2") || undefined;
}

/** The single folder every path is in (`my-skill` for `my-skill/SKILL.md`, …), if there is one. */
function commonTopFolder(paths: readonly string[]): string | undefined {
  const [first] = paths;
  if (!first?.includes("/")) return undefined;
  const top = first.slice(0, first.indexOf("/"));
  return paths.every((path) => path.startsWith(`${top}/`)) ? top : undefined;
}
