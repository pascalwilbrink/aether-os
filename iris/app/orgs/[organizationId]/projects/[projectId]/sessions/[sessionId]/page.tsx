import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import { getAgent, getCouncil } from "@/lib/api/agora";
import { getSession, listSessionMessages } from "@/lib/api/hephaestus";
import { requireOrganization } from "@/lib/auth/current";
import { participationLabel, sessionStatus } from "@/lib/sessions";
import { formatTime } from "@/lib/tasks";

import { endSessionAction } from "../actions";
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
  const [agent, council] = await Promise.all([
    getAgent(token, organizationId, session.agentId).catch(() => null),
    session.councilId
      ? getCouncil(token, organizationId, session.councilId).catch(() => null)
      : Promise.resolve(null),
  ]);
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

      <SessionChat
        project={{ organizationId, projectId }}
        sessionId={sessionId}
        initial={messages}
        agentName={agentName}
        members={session.members}
        ended={ended}
      />
    </div>
  );
}
