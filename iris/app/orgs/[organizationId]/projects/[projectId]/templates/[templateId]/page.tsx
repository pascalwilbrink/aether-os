import Link from "next/link";
import { Suspense } from "react";

import { TaskBrief } from "@/app/components/task-brief";
import { getTaskTemplate, getTaskTemplateVersion } from "@/lib/api/hephaestus";
import { ApiError } from "@/lib/api/http";
import { listServiceAccounts } from "@/lib/api/pistis";
import { getProject, listProjectMemberships } from "@/lib/api/polis";
import { listRepositoryLinks, orUnavailable } from "@/lib/api/proxenos";
import { listKnowledgeItems } from "@/lib/api/seshat";
import { requireOrganization } from "@/lib/auth/current";
import { repositoryChoices } from "@/lib/github";
import { runnableServiceAccounts } from "@/lib/members";

import { TemplateTaskForm } from "../../template-task-form";

type Props =
  PageProps<"/orgs/[organizationId]/projects/[projectId]/templates/[templateId]">;

/** A template's latest version as this project would use it, and a task from it. */
export default function TemplatePage({ params }: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Template params={params} />
    </Suspense>
  );
}

async function Template({ params }: Pick<Props, "params">) {
  const { organizationId, projectId, templateId } = await params;
  const projectPath = `/orgs/${organizationId}/projects/${projectId}`;
  const session = await requireOrganization(
    organizationId,
    `${projectPath}/templates/${templateId}`,
  );
  const token = session.accessToken;
  const [project, template, serviceAccounts, grants, links, knowledge] =
    await Promise.all([
      getProject(token, organizationId, projectId),
      getTaskTemplate(token, organizationId, templateId),
      listServiceAccounts(token, organizationId).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403)
          return { items: [], nextCursor: null };
        throw error;
      }),
      listProjectMemberships(token, organizationId, projectId),
      orUnavailable(listRepositoryLinks(token, organizationId, projectId)),
      orUnavailable(
        listKnowledgeItems(token, organizationId, projectId, {
          status: "accepted",
        }),
      ),
    ]);
  const version = await getTaskTemplateVersion(
    token,
    organizationId,
    templateId,
    template.latestVersion,
  );
  const { effective } = version;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={projectPath} className="underline">
            {project.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">{template.name}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {template.projectId
            ? "This project's template"
            : "Organization-wide template"}{" "}
          · version {version.version}
          {version.content.extends
            ? ` · extends an organization template (v${version.content.extends.version})`
            : ""}
        </p>
        {template.description ? (
          <p className="mt-2 text-sm">{template.description}</p>
        ) : null}
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">What a task gets</h2>
        <p className="text-sm">
          <span className="text-zinc-500">Title: </span>
          {effective.title}
        </p>
        <TaskBrief
          description={effective.description}
          expectedOutcome={effective.expectedOutcome}
          requirements={effective.requirements}
          constraints={effective.constraints}
          deliverables={effective.deliverables}
        />
        {effective.context.length > 0 ? (
          <div className="text-sm">
            <h3 className="font-medium">Knowledge it pins</h3>
            <ul className="mt-1 list-inside list-disc">
              {effective.context.map((entry) => {
                const item = knowledge.items.find((i) => i.id === entry.itemId);
                return (
                  <li key={entry.itemId}>
                    <Link
                      href={`${projectPath}/knowledge/${entry.itemId}`}
                      className="underline"
                    >
                      {item?.title ?? entry.itemId}
                    </Link>
                    {item || knowledge.unavailable ? null : (
                      <span className="text-xs text-zinc-500">
                        {" "}
                        (not an accepted item of this project: tasks from it
                        will be refused)
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {effective.acceptanceCriteria.length > 0 ? (
          <ul className="list-inside list-disc text-sm">
            {effective.acceptanceCriteria.map((criterion) => (
              <li key={criterion.key}>
                <span className="font-mono text-xs">{criterion.key}</span>{" "}
                {criterion.description}{" "}
                <span className="text-xs text-zinc-500">
                  ({criterion.check.type})
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {template.status === "archived" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Archived: no new tasks from it.
        </p>
      ) : (
        <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-medium">New task from this template</h2>
          <TemplateTaskForm
            template={{
              organizationId,
              projectId,
              templateId,
              version: version.version,
            }}
            version={version}
            serviceAccounts={runnableServiceAccounts(
              serviceAccounts.items,
              grants.items,
            ).map(({ id, name }) => ({
              id,
              name,
            }))}
            repositories={repositoryChoices(links.items)}
            knowledge={knowledge.items.map(({ id, title, type }) => ({
              id,
              title,
              type,
            }))}
            idempotencyKey={crypto.randomUUID()}
          />
        </section>
      )}
    </div>
  );
}
