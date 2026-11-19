import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import { getSkill, getSkillVersion, listSkillVersions } from "@/lib/api/hephaestus";
import { requireOrganization } from "@/lib/auth/current";
import { formatBytes } from "@/lib/skills";
import { formatTime } from "@/lib/tasks";

import { archiveSkillAction, createSkillVersionAction } from "../actions";
import { SkillForm } from "../skill-form";

type Props = PageProps<"/orgs/[organizationId]/skills/[skillId]">;

/** One skill: its versions, a version's files (`?version=`, else the latest), and the next version. */
export default function SkillPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SkillDetails {...props} />
    </Suspense>
  );
}

async function SkillDetails({ params, searchParams }: Props) {
  const { organizationId, skillId } = await params;
  const query = await searchParams;
  const path = `/orgs/${organizationId}/skills/${skillId}`;
  const session = await requireOrganization(organizationId, path);
  const token = session.accessToken;
  const [skill, versions] = await Promise.all([
    getSkill(token, organizationId, skillId),
    listSkillVersions(token, organizationId, skillId),
  ]);
  const asked = Number(typeof query.version === "string" ? query.version : NaN);
  const shown = Number.isInteger(asked) && asked >= 1 && asked <= skill.latestVersion ? asked : skill.latestVersion;
  const [version, latest] = await Promise.all([
    getSkillVersion(token, organizationId, skillId, shown),
    shown === skill.latestVersion ? null : getSkillVersion(token, organizationId, skillId, skill.latestVersion),
  ]);
  const latestSkillMd = (latest ?? version).files?.find((file) => file.path === "SKILL.md")?.content ?? "";
  const ref = { organizationId, skillId };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Link href={`/orgs/${organizationId}/skills`} className="underline">
              Skills
            </Link>
          </p>
          <h1 className="font-mono text-2xl font-semibold">
            {skill.name}{" "}
            {skill.status === "archived" ? (
              <span className="align-middle font-sans text-sm font-normal text-zinc-500">(archived)</span>
            ) : null}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{skill.description}</p>
        </div>
        {skill.status === "active" ? (
          <ActionButton
            action={archiveSkillAction.bind(null, ref)}
            label="Archive"
            pendingLabel="Archiving…"
            confirmText={`Archive ${skill.name}? New agent versions can't choose it; versions that use it keep it.`}
          />
        ) : null}
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Versions</h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {versions.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`${path}?version=${item.version}`}
                className={`flex flex-wrap items-baseline gap-x-3 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 ${item.version === shown ? "bg-zinc-100 dark:bg-zinc-900" : ""}`}
              >
                <span className="font-medium">Version {item.version}</span>
                <span className="text-zinc-500">
                  {item.fileCount} {item.fileCount === 1 ? "file" : "files"} · {formatBytes(item.sizeBytes)} · by{" "}
                  {item.createdBy} on {formatTime(item.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Version {version.version}&apos;s files</h2>
        {(version.files ?? []).map((file) => (
          <details key={file.path} open={file.path === "SKILL.md"} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer px-4 py-2 font-mono text-sm">{file.path}</summary>
            <pre className="overflow-x-auto whitespace-pre-wrap border-t border-zinc-200 p-4 text-sm dark:border-zinc-800">
              {file.content}
            </pre>
          </details>
        ))}
      </section>

      {skill.status === "active" ? (
        <section className="space-y-3">
          <h2 className="font-medium">New version, from version {skill.latestVersion}</h2>
          {/* Keyed: after a save, the form starts from the new latest version. */}
          <SkillForm key={skill.latestVersion} action={createSkillVersionAction.bind(null, ref)} skillMd={latestSkillMd} />
        </section>
      ) : null}
    </div>
  );
}
