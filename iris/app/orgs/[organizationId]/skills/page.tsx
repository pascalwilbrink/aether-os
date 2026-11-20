import Link from "next/link";
import { Suspense } from "react";

import { listSkills } from "@/lib/api/hephaestus";
import { requireOrganization } from "@/lib/auth/current";

import { createSkillAction } from "./actions";
import { SkillForm } from "./skill-form";

type Props = PageProps<"/orgs/[organizationId]/skills">;

/** The organization's skills, which agent versions pin. */
export default function SkillsPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Skills {...props} />
    </Suspense>
  );
}

async function Skills({ params }: Props) {
  const { organizationId } = await params;
  const session = await requireOrganization(
    organizationId,
    `/orgs/${organizationId}/skills`,
  );
  const skills = await listSkills(session.accessToken, organizationId);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={`/orgs/${organizationId}/agents`} className="underline">
            Agents
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Skills</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Know-how agents read when a task calls for it: a SKILL.md with
          instructions, and any files it refers to. Choose skills on an
          agent&apos;s version; each version pins the skill version it was made
          with. In a sandbox, a skill&apos;s files are at
          /workspace/skills/&lt;name&gt;, so its scripts can run.
        </p>
      </div>

      {skills.items.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No skills yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {skills.items.map((skill) => (
            <li key={skill.id}>
              <Link
                href={`/orgs/${organizationId}/skills/${skill.id}`}
                className="block px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <span className="font-mono font-medium">{skill.name}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  version {skill.latestVersion}
                  {skill.status === "archived" ? " · archived" : ""}
                </span>
                <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                  {skill.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3">
        <h2 className="font-medium">New skill</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Iris writes a skill&apos;s SKILL.md; a skill with more files
          (references, scripts) comes through Hephaestus&apos;s API, and Iris
          keeps them in new versions.
        </p>
        <SkillForm action={createSkillAction.bind(null, organizationId)} />
      </section>
    </div>
  );
}
