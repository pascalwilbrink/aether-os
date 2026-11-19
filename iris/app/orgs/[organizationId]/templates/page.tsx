import Link from "next/link";
import { Suspense } from "react";

import { listOrganizationTaskTemplates } from "@/lib/api/hephaestus";
import { listProjects } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";

type Props = PageProps<"/orgs/[organizationId]/templates">;

/** The organization-wide task templates (Hephaestus); projects add their own on their pages. */
export default function TemplatesPage({ params }: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Templates params={params} />
    </Suspense>
  );
}

async function Templates({ params }: Pick<Props, "params">) {
  const { organizationId } = await params;
  const session = await requireOrganization(organizationId, `/orgs/${organizationId}/templates`);
  const [templates, projects] = await Promise.all([
    listOrganizationTaskTemplates(session.accessToken, organizationId),
    listProjects(session.accessToken, organizationId),
  ]);
  const active = templates.items.filter((template) => template.status === "active");
  const firstProject = projects.items.find((project) => project.status === "active");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Task templates every project of the organization can start tasks from, with their definition of done. A
          project&apos;s own templates are on its page.
        </p>
      </div>
      {active.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No organization-wide templates yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {active.map((template) => (
            <li key={template.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="min-w-0">
                <span className="block font-medium">{template.name}</span>
                {template.description ? (
                  <span className="block truncate text-sm text-zinc-500">{template.description}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-3 text-sm text-zinc-500">
                v{template.latestVersion}
                {firstProject ? (
                  <Link
                    href={`/orgs/${organizationId}/projects/${firstProject.id}/templates/${template.id}`}
                    className="underline"
                  >
                    Open
                  </Link>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
