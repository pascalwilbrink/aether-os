import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import { TaskBrief } from "@/app/components/task-brief";
import { TemplateForm } from "@/app/components/template-form";
import { getTaskTemplate, getTaskTemplateVersion } from "@/lib/api/hephaestus";
import { listProjects } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { fieldsFromContent } from "@/lib/templates";

import { archiveTemplateAction, createTemplateVersionAction } from "../actions";
import { templateFormOptions } from "../options";
import { TemplateDefinition } from "./template-definition";

type Props = PageProps<"/orgs/[organizationId]/templates/[templateId]">;

/** An organization-wide template: what a task from it gets, editing it, archiving it. */
export default function OrganizationTemplatePage({ params }: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <OrganizationTemplate params={params} />
    </Suspense>
  );
}

async function OrganizationTemplate({ params }: Pick<Props, "params">) {
  const { organizationId, templateId } = await params;
  const path = `/orgs/${organizationId}/templates/${templateId}`;
  const session = await requireOrganization(organizationId, path);
  const token = session.accessToken;
  const [template, projects, options] = await Promise.all([
    getTaskTemplate(token, organizationId, templateId),
    listProjects(token, organizationId),
    templateFormOptions(token, organizationId, null),
  ]);
  const version = await getTaskTemplateVersion(
    token,
    organizationId,
    templateId,
    template.latestVersion,
  );
  const ref = { organizationId, projectId: null, templateId };
  const activeProjects = projects.items.filter(
    (project) => project.status === "active",
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Link
              href={`/orgs/${organizationId}/templates`}
              className="underline"
            >
              Templates
            </Link>
          </p>
          <h1 className="text-2xl font-semibold">
            {template.name}{" "}
            {template.status === "archived" ? (
              <span className="align-middle text-sm font-normal text-zinc-500">
                (archived)
              </span>
            ) : null}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Organization-wide template · version {version.version}
          </p>
          {template.description ? (
            <p className="mt-2 text-sm">{template.description}</p>
          ) : null}
        </div>
        {template.status === "active" ? (
          <ActionButton
            action={archiveTemplateAction.bind(null, ref)}
            label="Archive"
            pendingLabel="Archiving…"
            confirmText={`Archive ${template.name}? No new tasks start from it; tasks and project templates that pinned a version keep it.`}
          />
        ) : null}
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">What a task gets</h2>
        <p className="text-sm">
          <span className="text-zinc-500">Title: </span>
          {version.effective.title}
        </p>
        <TaskBrief
          description={version.effective.description}
          expectedOutcome={version.effective.expectedOutcome}
          requirements={version.effective.requirements}
          constraints={version.effective.constraints}
          deliverables={version.effective.deliverables}
        />
        <TemplateDefinition effective={version.effective} />
        {activeProjects.length > 0 && template.status === "active" ? (
          <p className="text-sm">
            Start a task from it in{" "}
            {activeProjects.map((project, i) => (
              <span key={project.id}>
                {i > 0 ? ", " : ""}
                <Link
                  href={`/orgs/${organizationId}/projects/${project.id}/templates/${templateId}`}
                  className="underline"
                >
                  {project.name}
                </Link>
              </span>
            ))}
            .
          </p>
        ) : null}
      </section>

      {template.status === "active" ? (
        <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div>
            <h2 className="font-medium">
              Edit: version {template.latestVersion + 1}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Starts from version {version.version}. Tasks and project templates
              that pinned an earlier version keep it.
            </p>
          </div>
          {/* Keyed: after a save, the form starts from the new latest version. */}
          <TemplateForm
            key={template.latestVersion}
            action={createTemplateVersionAction.bind(null, ref)}
            defaults={fieldsFromContent(version.content)}
            creating={false}
            agents={options.agents}
            submitLabel="Save as a new version"
          />
        </section>
      ) : null}
    </div>
  );
}
