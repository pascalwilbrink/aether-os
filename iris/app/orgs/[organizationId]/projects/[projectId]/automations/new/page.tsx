import Link from "next/link";
import { Suspense } from "react";

import { getProject } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { fieldsOf } from "@/lib/automations";

import { createAutomationAction } from "../actions";
import { AutomationForm } from "../automation-form";
import { automationOptions } from "../options";

type Props = PageProps<"/orgs/[organizationId]/projects/[projectId]/automations/new">;

/** A new automation in a project (docs/automations.md). */
export default function NewAutomationPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <NewAutomation {...props} />
    </Suspense>
  );
}

async function NewAutomation({ params }: Props) {
  const { organizationId, projectId } = await params;
  const projectPath = `/orgs/${organizationId}/projects/${projectId}`;
  const session = await requireOrganization(organizationId, `${projectPath}/automations/new`);
  const token = session.accessToken;
  const [project, options] = await Promise.all([
    getProject(token, organizationId, projectId),
    automationOptions(token, organizationId, projectId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={`${projectPath}#automations`} className="underline">
            {project.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">New automation</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          When something happens on GitHub, start a task: e.g. an agent that fixes every issue labelled “aether” and
          opens a pull request. Issues come from the repositories linked to this project.
        </p>
      </div>
      {options.repositoriesUnavailable ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          The project&apos;s repositories can&apos;t be shown right now; the automation can still use any of them.
        </p>
      ) : null}
      <AutomationForm
        action={createAutomationAction.bind(null, { organizationId, projectId })}
        defaults={fieldsOf()}
        options={options}
        submitLabel="Create automation"
      />
    </div>
  );
}
