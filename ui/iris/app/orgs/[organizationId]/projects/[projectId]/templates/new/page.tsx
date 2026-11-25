import Link from "next/link";
import { Suspense } from "react";

import { TemplateForm } from "@/app/components/template-form";
import { getProject } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";

import { createTemplateAction } from "../../../../templates/actions";
import { templateFormOptions } from "../../../../templates/options";

type Props =
  PageProps<"/orgs/[organizationId]/projects/[projectId]/templates/new">;

/** A new template of this project: its own, or extending an organization one. */
export default function NewProjectTemplatePage({ params }: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <NewProjectTemplate params={params} />
    </Suspense>
  );
}

async function NewProjectTemplate({ params }: Pick<Props, "params">) {
  const { organizationId, projectId } = await params;
  const projectPath = `/orgs/${organizationId}/projects/${projectId}`;
  const session = await requireOrganization(
    organizationId,
    `${projectPath}/templates/new`,
  );
  const [project, options] = await Promise.all([
    getProject(session.accessToken, organizationId, projectId),
    templateFormOptions(session.accessToken, organizationId, projectId),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={projectPath} className="underline">
            {project.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">New template</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Only this project starts tasks from it.
        </p>
      </div>
      <TemplateForm
        action={createTemplateAction.bind(null, { organizationId, projectId })}
        creating
        agents={options.agents}
        organizationTemplates={options.organizationTemplates}
        knowledge={options.knowledge}
        submitLabel="Create template"
      />
    </div>
  );
}
