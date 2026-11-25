"use client";

import { useActionState, useState } from "react";

import { buttonClass, FormError, inputClass } from "@aether-os/design";
import {
  filesOfZip,
  isJunk,
  MAX_SKILL_BYTES,
  MAX_SKILL_FILES,
  skillFolderOf,
  skillNameOf,
  type PickedFile,
} from "@/lib/skill-upload";
import { formatBytes, skillTemplate, type SkillFile } from "@/lib/skills";

import type { SkillFormState } from "./actions";

type Action = (
  state: SkillFormState,
  form: FormData,
) => Promise<SkillFormState>;

/** An upload's files other than SKILL.md, and what was left out of it. */
interface Upload {
  files: SkillFile[];
  skipped: string[];
}

/**
 * A skill's SKILL.md, for a new skill with its name, for a new version of one
 * starting from its latest (whose other files it keeps). Or a whole folder or
 * .zip: its SKILL.md lands in the editor, its other files replace the
 * version's.
 */
export function SkillForm({
  action,
  skillMd,
  keptFiles = [],
}: {
  action: Action;
  skillMd?: string;
  /** The other files a new version keeps when nothing is uploaded. */
  keptFiles?: string[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const creating = skillMd === undefined;
  // Controlled, so a refused save keeps what was written and uploaded.
  const [upload, setUpload] = useState<Upload | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState(skillMd ?? skillTemplate(""));
  const [uploadError, setUploadError] = useState<string>();
  const [reading, setReading] = useState(false);

  async function pick(read: () => Promise<PickedFile[] | { error: string }>) {
    setUploadError(undefined);
    setReading(true);
    try {
      const picked = await read();
      const folder = "error" in picked ? picked : skillFolderOf(picked);
      if ("error" in folder) {
        setUploadError(folder.error);
        return;
      }
      const [main, ...others] = folder.files;
      setText(main.content);
      if (creating && !name) setName(skillNameOf(main.content) ?? "");
      setUpload({ files: others, skipped: folder.skipped });
    } catch {
      setUploadError("The files couldn't be read.");
    } finally {
      setReading(false);
    }
  }

  return (
    <form action={formAction} className="space-y-3">
      <FormError error={uploadError ?? state.error} />
      {state.notice ? (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-300"
        >
          {state.notice}
        </p>
      ) : null}

      <fieldset className="space-y-2 rounded-lg border border-dashed border-zinc-300 p-3 text-sm dark:border-zinc-700">
        <legend className="px-1 text-zinc-600 dark:text-zinc-400">
          Upload a skill{" "}
          <span className="text-zinc-500">
            (its folder or a .zip of it: SKILL.md at the root, text files only,
            at most 100 files and 1 MiB)
          </span>
        </legend>
        <div className="flex flex-wrap gap-4">
          <label className="block">
            Folder
            <input
              type="file"
              // Not in React's types; every current browser picks folders with it.
              {...{ webkitdirectory: "" }}
              multiple
              disabled={reading}
              onChange={(event) => {
                const list = [...(event.target.files ?? [])];
                event.target.value = "";
                if (list.length > 0) void pick(() => readFolder(list));
              }}
              className="mt-1 block text-sm"
            />
          </label>
          <label className="block">
            .zip
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={reading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file)
                  void pick(async () =>
                    filesOfZip(new Uint8Array(await file.arrayBuffer())),
                  );
              }}
              className="mt-1 block text-sm"
            />
          </label>
        </div>
        {reading ? <p className="text-zinc-500">Reading…</p> : null}
        {upload ? (
          <UploadedFiles
            upload={upload}
            onClear={() => setUpload(null)}
            creating={creating}
          />
        ) : !creating && keptFiles.length > 0 ? (
          <p className="text-zinc-500">
            Without an upload, the new version keeps the latest one&apos;s other
            files: <span className="font-mono">{keptFiles.join(", ")}</span>.
          </p>
        ) : null}
      </fieldset>

      {upload ? (
        <input
          type="hidden"
          name="files"
          value={JSON.stringify(upload.files)}
        />
      ) : null}
      {creating ? (
        <label className="block max-w-sm text-sm">
          Name <span className="text-zinc-500">(as in SKILL.md)</span>
          <input
            name="name"
            required
            maxLength={64}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="code-review"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`${inputClass} font-mono`}
          />
        </label>
      ) : null}
      <label className="block text-sm">
        SKILL.md{" "}
        <span className="text-zinc-500">
          (front matter with its name and description, then the instructions)
        </span>
        <textarea
          name="skillMd"
          required
          rows={16}
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          className={`${inputClass} font-mono text-sm`}
        />
      </label>
      <button
        type="submit"
        disabled={pending || reading}
        className={buttonClass}
      >
        {pending
          ? "Saving…"
          : creating
            ? "Create skill"
            : "Save as a new version"}
      </button>
    </form>
  );
}

function UploadedFiles({
  upload,
  onClear,
  creating,
}: {
  upload: Upload;
  onClear: () => void;
  creating: boolean;
}) {
  const size = (file: SkillFile) =>
    new TextEncoder().encode(file.content).length;
  return (
    <div className="space-y-1">
      <p>
        SKILL.md is in the editor below
        {upload.files.length > 0
          ? `, with ${upload.files.length} more ${upload.files.length === 1 ? "file" : "files"}`
          : ", with no other files"}
        {creating ? "." : ", replacing the latest version's other files."}{" "}
        <button type="button" onClick={onClear} className="underline">
          Leave them out
        </button>
      </p>
      {upload.files.length > 0 ? (
        <ul className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {upload.files.map((file) => (
            <li key={file.path}>
              {file.path}{" "}
              <span className="text-zinc-500">({formatBytes(size(file))})</span>
            </li>
          ))}
        </ul>
      ) : null}
      {upload.skipped.length > 0 ? (
        <p className="text-xs text-zinc-500">
          Left out (hidden): {upload.skipped.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A picked folder's files, by their path in it (`my-skill/SKILL.md`); hidden
 * ones aren't read, and nothing is when it's more than a skill can hold.
 */
async function readFolder(
  all: File[],
): Promise<PickedFile[] | { error: string }> {
  const pathOf = (file: File) => file.webkitRelativePath || file.name;
  const files = all.filter((file) => !isJunk(pathOf(file)));
  // Hidden ones come along unread, so skillFolderOf lists them as left out.
  const hidden = all
    .filter((file) => isJunk(pathOf(file)))
    .map((file) => ({ path: pathOf(file), bytes: new Uint8Array() }));
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (files.length > MAX_SKILL_FILES || bytes > MAX_SKILL_BYTES) {
    return {
      error: `A skill has at most ${MAX_SKILL_FILES} files and 1 MiB in all; this folder has ${files.length} files, ${formatBytes(bytes)}.`,
    };
  }
  const read = await Promise.all(
    files.map(async (file) => ({
      path: pathOf(file),
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
  return [...read, ...hidden];
}
