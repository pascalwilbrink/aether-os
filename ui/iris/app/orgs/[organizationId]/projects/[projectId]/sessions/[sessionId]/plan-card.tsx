"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  buttonClass,
  FormError,
  inputClass,
  secondaryButtonClass,
} from "@aether-os/design";
import { StatusBadge } from "@/app/components/status-badge";
import type { CouncilPlan, CouncilPlanEntry, SessionMember, Task } from "@/lib/api";
import { planEntryGroups, planStatus } from "@/lib/plans";

import type { FormState, ProjectRef } from "../../actions";
import { decidePlanAction } from "../actions";

/**
 * A council's plan on its session's page (docs/councils.md, Planning and
 * delegation): its entries under their milestones, who does each and why,
 * and what each waits for; for a proposed plan the review (the service
 * account its tasks run as, a member per entry, approve, request changes or
 * reject); for an approved one the tasks it became, linked.
 */
export function PlanCard({
  project,
  sessionId,
  plan,
  members,
  tasks,
  planTask,
  serviceAccounts,
  ended,
}: {
  project: ProjectRef;
  sessionId: string;
  plan: CouncilPlan;
  members: SessionMember[];
  /** An approved plan's subtasks by entry key. */
  tasks: Record<string, Pick<Task, "id" | "status"> & { reassigned: boolean }>;
  planTask: Pick<Task, "id" | "status"> | null;
  serviceAccounts: { id: string; name: string }[];
  ended: boolean;
}) {
  const status = planStatus(plan.status);
  const reviewing = plan.status === "proposed";
  const [state, action, pending] = useActionState<FormState, FormData>(
    decidePlanAction.bind(null, {
      ...project,
      sessionId,
      planId: plan.id,
      entries: plan.entries.map(({ key, agentId }) => ({ key, agentId })),
    }),
    {},
  );
  const tasksPath = `/orgs/${project.organizationId}/projects/${project.projectId}/tasks`;
  const name = (agentId: string) =>
    members.find((member) => member.agentId === agentId)?.name ?? "Someone who left the council";
  const titleOf = (key: string) =>
    plan.entries.find((entry) => entry.key === key)?.title ?? key;

  const entryRow = (entry: CouncilPlanEntry) => {
    const task = tasks[entry.key];
    const chosen = state.values?.[`agent:${entry.key}`] ?? entry.agentId;
    return (
      <li
        key={entry.key}
        className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">
            {entry.title}
            {entry.key === plan.outcomeEntryKey && (
              <span className="ml-2 text-xs font-normal text-zinc-500">the plan&apos;s outcome</span>
            )}
          </span>
          {task && (
            <span className="flex items-center gap-2">
              <StatusBadge status={task.status} />
              <Link href={`${tasksPath}/${task.id}`} className="text-xs underline">
                Open task
              </Link>
            </span>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
          {entry.description}
        </p>
        {entry.expectedOutcome && (
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Expected: {entry.expectedOutcome}
          </p>
        )}
        {(entry.dependsOn ?? []).length > 0 && (
          <p className="mt-1 text-xs text-zinc-500">
            After: {(entry.dependsOn ?? []).map(titleOf).join(", ")}
          </p>
        )}
        <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {reviewing && !ended ? (
            <label className="flex flex-wrap items-center gap-2">
              Done by
              <select
                key={chosen}
                name={`agent:${entry.key}`}
                defaultValue={chosen}
                className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
              >
                {members.map((member) => (
                  <option key={member.agentId} value={member.agentId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span>Done by {name(entry.agentId)}</span>
          )}
          {task?.reassigned ? (
            <p className="mt-1">You gave it to this member when approving.</p>
          ) : (
            entry.reason && <p className="mt-1">Why: {entry.reason}</p>
          )}
        </div>
      </li>
    );
  };

  const body = (
    <>
      <p className="whitespace-pre-wrap">{plan.summary}</p>
      {planEntryGroups(plan).map(({ milestone, entries }) => (
        <div key={milestone?.key ?? "-"} className="space-y-2">
          {plan.milestones.length > 0 && (
            <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {milestone ? milestone.title : "Other work"}
              {milestone?.dependsOn?.length
                ? ` · after ${milestone.dependsOn
                    .map(
                      (key) =>
                        plan.milestones.find((other) => other.key === key)?.title ?? key,
                    )
                    .join(", ")}`
                : ""}
            </h4>
          )}
          {milestone?.description && (
            <p className="text-zinc-600 dark:text-zinc-400">{milestone.description}</p>
          )}
          <ol className="space-y-2">{entries.map(entryRow)}</ol>
        </div>
      ))}
    </>
  );

  return (
    <li className="space-y-3 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">
          Plan {plan.number}: {plan.title}
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.classes}`}>
          {status.label}
        </span>
        {planTask && (
          <span className="flex items-center gap-2">
            <StatusBadge status={planTask.status} />
            <Link href={`${tasksPath}/${planTask.id}`} className="text-xs underline">
              The plan&apos;s task
            </Link>
          </span>
        )}
      </div>
      {plan.review?.comment && (
        <p className="border-l-4 border-indigo-300 pl-2 text-zinc-700 dark:border-indigo-700 dark:text-zinc-300">
          You said: {plan.review.comment}
        </p>
      )}
      {plan.status === "approved" && !plan.taskId && (
        <p className="text-zinc-600 dark:text-zinc-400">
          Agreed. This council doesn&apos;t delegate, so it made no tasks.
        </p>
      )}
      {reviewing && !ended ? (
        <form action={action} className="space-y-3">
          {body}
          <div className="space-y-2 rounded-md bg-amber-50 p-3 dark:bg-amber-950/40">
            <FormError error={state.error} />
            <label className="block">
              Its tasks run as
              <select
                key={state.values?.serviceAccountId ?? ""}
                name="serviceAccountId"
                defaultValue={state.values?.serviceAccountId ?? serviceAccounts[0]?.id ?? ""}
                className={inputClass}
              >
                {serviceAccounts.length === 0 && (
                  <option value="">No service account has a role in this project</option>
                )}
                {serviceAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Comment
              <textarea
                name="comment"
                rows={2}
                placeholder="Required when requesting changes"
                defaultValue={state.values?.comment}
                className={inputClass}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="decision"
                value="approve"
                disabled={pending}
                className={buttonClass}
              >
                Approve
              </button>
              <button
                type="submit"
                name="decision"
                value="request-changes"
                disabled={pending}
                className={secondaryButtonClass}
              >
                Request changes
              </button>
              <button
                type="submit"
                name="decision"
                value="reject"
                disabled={pending}
                className={secondaryButtonClass}
              >
                Reject
              </button>
            </div>
          </div>
        </form>
      ) : (
        <details open={plan.status === "approved" || plan.status === "proposed"}>
          <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
            Entries ({plan.entries.length})
          </summary>
          <div className="mt-2 space-y-3">{body}</div>
        </details>
      )}
    </li>
  );
}
