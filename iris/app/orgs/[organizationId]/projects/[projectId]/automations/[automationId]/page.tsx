import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import { getAutomation, listAutomationRuns } from "@/lib/api/kairos";
import { getProject } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { automationStatus, fieldsOf, runStatusLabel, triggerSummary } from "@/lib/automations";
import { formatTime } from "@/lib/tasks";

import { changeAutomationStatusAction, updateAutomationAction } from "../actions";
import { AutomationForm } from "../automation-form";
import { automationOptions } from "../options";

type Props = PageProps<"/orgs/[organizationId]/projects/[projectId]/automations/[automationId]">;

/** An automation: what fires it, its runs, and changing it. */
export default function AutomationPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <AutomationDetails {...props} />
    </Suspense>
  );
}

async function AutomationDetails({ params }: Props) {
  const { organizationId, projectId, automationId } = await params;
  const projectPath = `/orgs/${organizationId}/projects/${projectId}`;
  const session = await requireOrganization(organizationId, `${projectPath}/automations/${automationId}`);
  const token = session.accessToken;
  const [project, automation, runs, options] = await Promise.all([
    getProject(token, organizationId, projectId),
    getAutomation(token, organizationId, projectId, automationId),
    listAutomationRuns(token, organizationId, projectId, automationId),
    automationOptions(token, organizationId, projectId),
  ]);
  const ref = { organizationId, projectId, automationId };
  const status = automationStatus(automation.status);
  const repository =
    options.repositories.find((choice) => choice.id === automation.trigger.repositoryLinkId)?.name ??
    (automation.trigger.repositoryLinkId ? "a repository no longer linked" : null);
  const { action } = automation;
  const agent = options.agents.find((choice) => choice.id === action.task?.agentId)?.name;
  const template = options.templates.find((choice) => choice.id === action.template?.templateId)?.name;
  const runsAs = options.serviceAccounts.find((choice) => choice.id === action.serviceAccountId)?.name;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Link href={`${projectPath}#automations`} className="underline">
              {project.name}
            </Link>
          </p>
          <h1 className="text-2xl font-semibold">
            {automation.name}{" "}
            <span className={`ml-1 rounded-full px-2 py-0.5 align-middle text-xs font-medium ${status.classes}`}>
              {status.label}
            </span>
          </h1>
          {automation.description ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{automation.description}</p>
          ) : null}
          <p className="mt-2 text-sm">{triggerSummary(automation.trigger, repository)}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Starts{" "}
            {action.template
              ? `a task from the template ${template ?? "(no longer available)"}`
              : `a task for ${agent ?? "an agent no longer available"}`}
            , running as {runsAs ?? "a service account without a role here"}
            {action.workInRepository === false ? "" : ", in the issue's repository"}
            {(action.reviewArtifactKinds ?? []).length > 0 ? "; everything it produces needs approval" : ""}.
          </p>
        </div>
        {automation.status === "archived" ? null : (
          <div className="flex gap-2">
            {automation.status === "active" ? (
              <ActionButton
                action={changeAutomationStatusAction.bind(null, { ...ref, change: "pause" })}
                label="Pause"
                pendingLabel="Pausing…"
              />
            ) : (
              <ActionButton
                action={changeAutomationStatusAction.bind(null, { ...ref, change: "resume" })}
                label="Resume"
                pendingLabel="Resuming…"
                primary
              />
            )}
            <ActionButton
              action={changeAutomationStatusAction.bind(null, { ...ref, change: "archive" })}
              label="Archive"
              pendingLabel="Archiving…"
              confirmText={`Archive ${automation.name}? It stops for good; its runs stay.`}
            />
          </div>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Runs</h2>
        {runs.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">It hasn&apos;t fired yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 font-normal">Issue</th>
                <th className="py-1 font-normal">By</th>
                <th className="py-1 font-normal">Outcome</th>
                <th className="py-1 font-normal">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {runs.items.map((run) => (
                <tr key={run.id} className="align-top">
                  <td className="py-2 pr-2">
                    <a href={run.event.url} className="hover:underline" rel="noreferrer" target="_blank">
                      {run.event.repository}#{run.event.issueNumber}
                    </a>
                  </td>
                  <td className="py-2 pr-2">{run.event.author}</td>
                  <td className="py-2 pr-2">
                    {run.taskId ? (
                      <Link href={`${projectPath}/tasks/${run.taskId}`} className="underline">
                        {runStatusLabel(run.status)}
                      </Link>
                    ) : (
                      runStatusLabel(run.status)
                    )}
                    {run.rejection ? (
                      <p className="text-xs text-red-700 dark:text-red-300">{run.rejection.message}</p>
                    ) : null}
                  </td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{formatTime(run.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {automation.status === "archived" ? null : (
        <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-medium">Change it</h2>
          <AutomationForm
            action={updateAutomationAction.bind(null, ref)}
            defaults={fieldsOf(automation)}
            options={options}
            submitLabel="Save"
          />
        </section>
      )}
    </div>
  );
}
