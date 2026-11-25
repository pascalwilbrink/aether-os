import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { ActionButton, RoleForm } from "@/app/components/action-forms";
import { getAgent, getCouncil, listCouncilVersions } from "@/lib/api/agora";
import type { CouncilPlan, Task } from "@/lib/api";
import {
  getSession,
  getTask,
  listCouncilPlans,
  listDeliberationRounds,
  listSessionMessages,
  listSessionSyntheses,
  listTasks,
} from "@/lib/api/hephaestus";
import { orUnavailable } from "@/lib/api/http";
import { listServiceAccounts } from "@/lib/api/pistis";
import { listKnowledgeItems } from "@/lib/api/seshat";
import { listProjectMemberships } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { knowledgeStatus } from "@/lib/knowledge";
import { runnableServiceAccounts } from "@/lib/members";
import { tasksByEntry } from "@/lib/plans";
import {
  participationLabel,
  roundStatus,
  sessionModeChoices,
  sessionModeLabel,
  sessionStatus,
} from "@/lib/sessions";
import { formatTime } from "@/lib/tasks";

import { endSessionAction, setSessionModeAction } from "../actions";
import { PlanCard } from "./plan-card";
import { SessionChat } from "./session-chat";

type Props = PageProps<"/orgs/[organizationId]/projects/[projectId]/sessions/[sessionId]">;

/** One session: the conversation, live; a council's members; ending it. */
export default function SessionPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Session {...props} />
    </Suspense>
  );
}

async function Session({ params }: Props) {
  const { organizationId, projectId, sessionId } = await params;
  const sessionsPath = `/orgs/${organizationId}/projects/${projectId}/sessions`;
  const auth = await requireOrganization(organizationId, `${sessionsPath}/${sessionId}`);
  const token = auth.accessToken;
  const [session, messages] = await Promise.all([
    getSession(token, organizationId, projectId, sessionId),
    listSessionMessages(token, organizationId, projectId, sessionId),
  ]);
  const [agent, council, rounds, councilVersions, plans, syntheses, decisions] = await Promise.all([
    getAgent(token, organizationId, session.agentId).catch(() => null),
    session.councilId
      ? getCouncil(token, organizationId, session.councilId).catch(() => null)
      : Promise.resolve(null),
    session.councilId
      ? listDeliberationRounds(token, organizationId, projectId, sessionId)
      : Promise.resolve([]),
    session.councilId
      ? listCouncilVersions(token, organizationId, session.councilId).catch(() => null)
      : Promise.resolve(null),
    session.councilId
      ? listCouncilPlans(token, organizationId, projectId, sessionId)
      : Promise.resolve([]),
    session.councilId
      ? listSessionSyntheses(token, organizationId, projectId, sessionId)
      : Promise.resolve([]),
    // The council's decisions are Seshat's items; the page works without it.
    session.councilId
      ? orUnavailable(
          listKnowledgeItems(token, organizationId, projectId, { sessionId }),
        )
      : Promise.resolve({ items: [], unavailable: false }),
  ]);
  const roundNumber = (roundId: string) =>
    rounds.find((round) => round.id === roundId)?.number;
  const [planWork, serviceAccounts] = await Promise.all([
    Promise.all(
      plans.map((plan) => planTasks(token, organizationId, projectId, plan)),
    ),
    plans.some((plan) => plan.status === "proposed")
      ? reviewerAccounts(token, organizationId, projectId)
      : Promise.resolve([]),
  ]);
  const councilVersion = councilVersions?.items.find(
    (version) => version.id === session.councilVersionId,
  );
  const modes = councilVersion ? sessionModeChoices(councilVersion.settings) : [];
  const memberName = (agentId: string) =>
    session.members.find((member) => member.agentId === agentId)?.name ?? "A member";
  const agentName = agent?.name ?? "The agent";
  const status = sessionStatus(session);
  const ended = session.status === "ended";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Link href={sessionsPath} className="underline">
              Sessions
            </Link>
          </p>
          <h1 className="text-2xl font-semibold">
            {session.title ?? `With ${council?.name ?? agentName}`}
            <span className={`ml-3 align-middle rounded-full px-2 py-0.5 text-xs font-medium ${status.classes}`}>
              {status.label}
            </span>
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {council
              ? `The council ${council.name}, facilitated by ${agentName}.`
              : `With ${agentName}.`}{" "}
            Started {formatTime(session.createdAt)}
            {session.endedAt ? `, ended ${formatTime(session.endedAt)}` : ""}.
          </p>
        </div>
        {!ended && (
          <ActionButton
            action={endSessionAction.bind(null, { organizationId, projectId, sessionId })}
            label="End session"
            pendingLabel="Ending…"
            confirmText="End this session? Its conversation stays, but it can't carry on."
          />
        )}
      </div>

      {session.mode && (
        <section className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            <span className="font-medium">Working:</span> {sessionModeLabel(session.mode)}
          </span>
          {!ended && modes.length > 1 && (
            <RoleForm
              action={setSessionModeAction.bind(null, { organizationId, projectId, sessionId })}
              roles={modes}
              current={session.mode}
              label="Switch"
              ariaLabel="Way of working"
            />
          )}
        </section>
      )}

      {session.members.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Members</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {session.members.map((member) => (
              <li
                key={member.agentId}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span className="font-medium">{member.name}</span>
                {member.role ? (
                  <span className="text-zinc-600 dark:text-zinc-400"> · {member.role}</span>
                ) : null}
                <p className="text-zinc-600 dark:text-zinc-400">{participationLabel(member)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rounds.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Rounds</h2>
          <ol className="space-y-2">
            {rounds.map((round) => (
              <li
                key={round.id}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <p>
                  <span className="font-medium">Round {round.number}</span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {" "}
                    · {roundStatus(round)} · {round.participants.map(memberName).join(", ")}
                  </span>
                </p>
                <p className="mt-1">{round.question}</p>
                {round.conclusion && (
                  <p className="mt-2 whitespace-pre-wrap border-l-4 border-indigo-300 pl-2 text-zinc-700 dark:border-indigo-700 dark:text-zinc-300">
                    {round.conclusion}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {(decisions.items.length > 0 || decisions.unavailable) && (
        <section className="space-y-2">
          <h2 className="font-medium">Decisions</h2>
          {decisions.unavailable ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              The project&apos;s knowledge is unavailable, so its decisions can&apos;t be shown.
            </p>
          ) : (
            <ul className="space-y-2">
              {decisions.items.map((item) => {
                const status = knowledgeStatus(item.status);
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                  >
                    <Link
                      href={`/orgs/${organizationId}/projects/${projectId}/knowledge/${item.id}`}
                      className="font-medium underline"
                    >
                      {item.title}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.classes}`}>
                      {status.label}
                    </span>
                    {item.status === "proposed" && (
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        An approver accepts it in Knowledge.
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {syntheses.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Syntheses</h2>
          <ol className="space-y-2">
            {syntheses.map((synthesis) => (
              <li
                key={synthesis.id}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <p className="font-medium">
                  Synthesis {synthesis.number}
                  <span className="font-normal text-zinc-600 dark:text-zinc-400">
                    {" "}
                    · {formatTime(synthesis.writtenAt)}
                    {synthesis.roundIds.length > 0
                      ? ` · ${synthesis.roundIds
                          .map((id) => roundNumber(id))
                          .filter((number) => number !== undefined)
                          .map((number) => `round ${number}`)
                          .join(", ")}`
                      : ""}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap">{synthesis.content}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {plans.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Plans</h2>
          <ol className="space-y-3">
            {plans
              .map((plan, index) => ({ plan, work: planWork[index] }))
              .reverse()
              .map(({ plan, work }) => (
                <PlanCard
                  key={plan.id}
                  project={{ organizationId, projectId }}
                  sessionId={sessionId}
                  plan={plan}
                  members={session.members}
                  tasks={work.tasks}
                  planTask={work.planTask}
                  serviceAccounts={serviceAccounts}
                  ended={ended}
                />
              ))}
          </ol>
        </section>
      )}

      <SessionChat
        project={{ organizationId, projectId }}
        sessionId={sessionId}
        initial={messages}
        rounds={rounds}
        agentName={agentName}
        members={session.members}
        ended={ended}
      />
    </div>
  );
}

/** The tasks an approved plan became: its plan task and its subtasks by entry (none when they can't be read). */
async function planTasks(
  token: string,
  organizationId: string,
  projectId: string,
  plan: CouncilPlan,
): Promise<{
  planTask: Pick<Task, "id" | "status"> | null;
  tasks: Record<string, Pick<Task, "id" | "status"> & { reassigned: boolean }>;
}> {
  if (!plan.taskId) return { planTask: null, tasks: {} };
  try {
    const [planTask, subtasks] = await Promise.all([
      getTask(token, organizationId, projectId, plan.taskId),
      listTasks(token, organizationId, projectId, { parentTaskId: plan.taskId }),
    ]);
    return {
      planTask: { id: planTask.id, status: planTask.status },
      tasks: Object.fromEntries(
        [...tasksByEntry(subtasks.items)].map(([key, task]) => [
          key,
          {
            id: task.id,
            status: task.status,
            reassigned: Boolean(
              task.origin?.assignedBy && task.origin.assignedBy !== "facilitator",
            ),
          },
        ]),
      ),
    };
  } catch (error) {
    unstable_rethrow(error);
    return { planTask: null, tasks: {} };
  }
}

/** The service accounts a plan's tasks can run as: active, with a role in the project. */
async function reviewerAccounts(
  token: string,
  organizationId: string,
  projectId: string,
): Promise<{ id: string; name: string }[]> {
  try {
    const [accounts, grants] = await Promise.all([
      listServiceAccounts(token, organizationId),
      listProjectMemberships(token, organizationId, projectId),
    ]);
    return runnableServiceAccounts(accounts.items, grants.items).map(({ id, name }) => ({
      id,
      name,
    }));
  } catch (error) {
    unstable_rethrow(error);
    return [];
  }
}
