import Link from "next/link";
import { Suspense } from "react";

import { ArtifactContent } from "@/app/components/artifact-view";
import { BudgetForm, BudgetMeter } from "@/app/components/budget";
import { StatusBadge } from "@/app/components/status-badge";
import { getTask, getTaskTreeBudget, listArtifacts, listExecutions } from "@/lib/api/hephaestus";
import { getProject } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { pausedMessage } from "@/lib/budgets";
import {
  artifactsByExecution,
  blockedHosts,
  failureLabel,
  formatCost,
  formatCount,
  formatTime,
  networkLabel,
  taskActions,
} from "@/lib/tasks";

import { setTaskBudgetAction } from "../../actions";
import { ReviewForm } from "../../review-form";
import { TaskActions } from "../../task-actions";

type Props = PageProps<"/orgs/[organizationId]/projects/[projectId]/tasks/[taskId]">;

/** A task: what it was asked, how its runs went, what it produced, and its drafts to review. */
export default function TaskPage({ params }: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <TaskView params={params} />
    </Suspense>
  );
}

async function TaskView({ params }: Pick<Props, "params">) {
  const { organizationId, projectId, taskId } = await params;
  const projectPath = `/orgs/${organizationId}/projects/${projectId}`;
  const session = await requireOrganization(organizationId, `${projectPath}/tasks/${taskId}`);
  const token = session.accessToken;
  const [project, task, executions, artifacts, budget] = await Promise.all([
    getProject(token, organizationId, projectId),
    getTask(token, organizationId, projectId, taskId),
    listExecutions(token, organizationId, projectId, taskId),
    listArtifacts(token, organizationId, projectId, taskId),
    getTaskTreeBudget(token, organizationId, projectId, taskId),
  ]);
  const actions = taskActions(task);
  const refused = blockedHosts(executions.items);
  const ref = { organizationId, projectId, taskId };
  const groups = artifactsByExecution(executions.items, artifacts.items);
  const who = (sub: string) => (sub === session.sub ? "you" : sub);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={projectPath} className="underline">
            {project.name}
          </Link>
          {task.parentTaskId ? (
            <>
              {" · "}
              <Link href={`${projectPath}/tasks/${task.parentTaskId}`} className="underline">
                Parent task
              </Link>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{task.title}</h1>
          <StatusBadge status={task.status} />
        </div>
        {task.failureReason ? (
          <p className="text-sm text-red-700 dark:text-red-300">{failureLabel(task.failureReason)}</p>
        ) : null}
        {task.status === "paused" && task.pausedFor ? (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
            {pausedMessage(task.pausedFor)}{" "}
            {task.pausedFor === "task_tree" ? (
              <a href="#budget" className="underline">
                Raise it
              </a>
            ) : (
              <Link
                href={
                  task.pausedFor === "project"
                    ? `${projectPath}#budget`
                    : task.pausedFor === "agent"
                      ? `/orgs/${organizationId}/agents/${task.agentId}#budget`
                      : `/orgs/${organizationId}/budget`
                }
                className="underline"
              >
                See the budget
              </Link>
            )}
          </p>
        ) : null}
        <TaskActions task={ref} cancel={actions.cancel} retry={actions.retry} />
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Instructions</h2>
        <pre className="whitespace-pre-wrap rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
          {task.instructions}
        </pre>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <Fact label="Attempt">{task.attempt}</Fact>
          <Fact label="Review round">{task.reviewRound}</Fact>
          <Fact label="Created">{formatTime(task.createdAt)}</Fact>
          <Fact label="Finished">{formatTime(task.finishedAt)}</Fact>
          {task.taskTemplateId ? (
            <Fact label="Template">
              <Link href={`${projectPath}/templates/${task.taskTemplateId}`} className="underline">
                v{task.taskTemplateVersion}
              </Link>
            </Fact>
          ) : null}
          {task.review.artifactKinds.length > 0 ? (
            <Fact label="Needs approval">
              {task.review.artifactKinds.includes("*") ? "everything" : task.review.artifactKinds.join(", ")}
            </Fact>
          ) : null}
        </dl>
      </section>

      {task.acceptanceCriteria.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-medium">Acceptance criteria</h2>
          <ul className="list-inside list-disc text-sm">
            {task.acceptanceCriteria.map((criterion) => (
              <li key={criterion.key}>
                <span className="font-mono text-xs">{criterion.key}</span> {criterion.description}{" "}
                <span className="text-xs text-zinc-500">
                  ({criterion.check.type}
                  {criterion.source === "template" ? ", from the template" : ""})
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-medium">Artifacts</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nothing yet.</p>
        ) : (
          groups.map(({ execution, items }) => (
            <div key={execution.id} className="space-y-3">
              <h3 className="text-sm text-zinc-500">
                Execution {execution.number}
                {execution.attempt > 1 ? ` (attempt ${execution.attempt})` : ""}
              </h3>
              {items.map((artifact) => (
                <article
                  key={artifact.id}
                  className={`space-y-2 rounded-lg border p-4 ${
                    artifact.status === "draft"
                      ? "border-amber-300 dark:border-amber-700"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <header className="flex flex-wrap items-baseline gap-2">
                    <h4 className="font-medium">
                      {artifact.kind === "verification" ? "Acceptance criteria checked" : artifact.title}
                    </h4>
                    <span className="text-xs text-zinc-500">
                      {artifact.kind === "verification" ? `round ${artifact.round}` : artifact.kind} ·{" "}
                      {artifact.status.replace("_", " ")}
                      {artifact.primary ? " · primary" : ""}
                      {artifact.revisionOf ? " · revision" : ""}
                    </span>
                  </header>
                  <ArtifactContent artifact={artifact} />
                  {artifact.review ? (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {artifact.review.decision.replace("_", " ")} by {who(artifact.review.decidedBy)}
                      {artifact.review.comments.length > 0
                        ? `: ${artifact.review.comments.map((comment) => comment.body).join(" · ")}`
                        : ""}
                    </p>
                  ) : null}
                  {artifact.status === "draft" ? <ReviewForm artifact={{ ...ref, artifactId: artifact.id }} /> : null}
                </article>
              ))}
            </div>
          ))
        )}
      </section>

      <section id="budget" className="space-y-3">
        <div>
          <h2 className="font-medium">Budget</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {task.parentTaskId
              ? "This task's tree (its top-level task and every subtask) shares one budget."
              : "This task and its subtasks share one budget for their model calls."}
          </p>
        </div>
        <BudgetMeter budget={budget} />
        <BudgetForm budget={budget} action={setTaskBudgetAction.bind(null, ref)} />
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Executions</h2>
        {executions.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Not started yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 font-normal">#</th>
                <th className="py-1 font-normal">Status</th>
                <th className="py-1 font-normal">Model calls</th>
                <th className="py-1 font-normal">Tokens in / out</th>
                <th className="py-1 font-normal">Cost</th>
                <th className="py-1 font-normal">Network</th>
                <th className="py-1 font-normal">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {executions.items.map((execution) => (
                <tr key={execution.id}>
                  <td className="py-2 pr-2">{execution.number}</td>
                  <td className="py-2 pr-2">
                    {execution.status}
                    {execution.error ? (
                      <span className="block text-xs text-red-700 dark:text-red-300">{execution.error}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2">{formatCount(execution.usage.modelCalls)}</td>
                  <td className="py-2 pr-2">
                    {formatCount(execution.usage.inputTokens)} / {formatCount(execution.usage.outputTokens)}
                  </td>
                  <td className="py-2 pr-2">{formatCost(execution.usage.costUsd)}</td>
                  <td className="py-2 pr-2" title={execution.sandbox?.allowedHosts.join(", ") || undefined}>
                    {networkLabel(execution)}
                  </td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{formatTime(execution.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {refused.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-medium">Blocked hosts</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            The sandbox tried to reach these hosts and was refused: they&apos;re not among the hosts its agent version
            may reach. If the agent needs one, add it to the allowed hosts of a new version of{" "}
            <Link href={`/orgs/${organizationId}/agents/${task.agentId}`} className="underline">
              the agent
            </Link>
            .
          </p>
          <ul className="space-y-1 text-sm">
            {refused.map(({ host, executions: numbers }) => (
              <li key={host}>
                <code className="font-mono">{host}</code>{" "}
                <span className="text-zinc-500">
                  (execution{numbers.length > 1 ? "s" : ""} {numbers.join(", ")})
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
