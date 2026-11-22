import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import type { CouncilVersion } from "@/lib/api";
import { getCouncil, listAgents, listCouncilVersions } from "@/lib/api/agora";
import { requireOrganization } from "@/lib/auth/current";
import { allowedModes, fieldsFromVersion, PARTICIPATION } from "@/lib/councils";
import { formatTime } from "@/lib/tasks";

import { archiveCouncilAction, publishCouncilVersionAction } from "../actions";
import { CouncilVersionForm } from "../council-forms";

type Props = PageProps<"/orgs/[organizationId]/councils/[councilId]">;

/** A council: its versions (facilitator, members, ways of working), publishing, archiving and the next version. */
export default function CouncilPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Council {...props} />
    </Suspense>
  );
}

async function Council({ params }: Props) {
  const { organizationId, councilId } = await params;
  const session = await requireOrganization(
    organizationId,
    `/orgs/${organizationId}/councils/${councilId}`,
  );
  const token = session.accessToken;
  const [council, versions, agents] = await Promise.all([
    getCouncil(token, organizationId, councilId),
    listCouncilVersions(token, organizationId, councilId),
    listAgents(token, organizationId),
  ]);
  const names = new Map(agents.items.map((agent) => [agent.id, agent.name]));
  const nameOf = (agentId: string) => names.get(agentId) ?? "An unknown agent";
  // Agora takes agents that are active and published.
  const choosable = agents.items
    .filter((agent) => agent.status === "active" && agent.latestVersionId)
    .map((agent) => ({ id: agent.id, name: agent.name }));
  const ref = { organizationId, councilId };
  const open =
    versions.items.find((version) => version.status === "published") ??
    versions.items[0];
  const latest = versions.items[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Link
              href={`/orgs/${organizationId}/councils`}
              className="underline"
            >
              Councils
            </Link>
          </p>
          <h1 className="text-2xl font-semibold">
            {council.name}{" "}
            <span className="font-mono text-sm text-zinc-500">
              {council.key}
            </span>
          </h1>
          {council.description ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {council.description}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-zinc-500">
            {council.status === "archived"
              ? "Archived: no new versions or sessions."
              : council.latestVersionId
                ? `New sessions use version ${versions.items.find((v) => v.id === council.latestVersionId)?.version ?? "?"}.`
                : "No published version yet: publish one for sessions to use it."}
          </p>
        </div>
        {council.status === "active" ? (
          <ActionButton
            action={archiveCouncilAction.bind(null, ref)}
            label="Archive"
            pendingLabel="Archiving…"
            confirmText={`Archive ${council.name}? It gets no new versions or sessions.`}
          />
        ) : null}
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Versions</h2>
        {versions.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No versions yet: write the first one below.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {versions.items.map((version) => (
              <li key={version.id} className="px-4 py-3">
                <details open={version.id === open?.id}>
                  <summary className="cursor-pointer">
                    Version {version.version}{" "}
                    <span className="text-zinc-500">
                      · {version.status} · by {version.createdBy},{" "}
                      {formatTime(version.createdAt)}
                    </span>
                  </summary>
                  <VersionDetails version={version} nameOf={nameOf} />
                  {version.status === "draft" && council.status === "active" ? (
                    <div className="mt-2">
                      <ActionButton
                        action={publishCouncilVersionAction.bind(null, {
                          ...ref,
                          versionId: version.id,
                        })}
                        label="Publish"
                        pendingLabel="Publishing…"
                        primary
                      />
                    </div>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {council.status === "active" ? (
        <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-medium">
            {latest ? `Version ${latest.version + 1}` : "First version"}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Versions never change: changing the council is writing a new one
            {latest ? `, starting from version ${latest.version}` : ""}.
          </p>
          {choosable.length < 2 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              A council needs a facilitator and at least one member, each an
              agent with a published version.{" "}
              <Link
                href={`/orgs/${organizationId}/agents`}
                className="underline"
              >
                Agents
              </Link>
            </p>
          ) : null}
          <CouncilVersionForm
            council={ref}
            agents={choosable}
            defaults={fieldsFromVersion(latest)}
          />
        </section>
      ) : null}
    </div>
  );
}

function VersionDetails({
  version,
  nameOf,
}: {
  version: CouncilVersion;
  nameOf: (agentId: string) => string;
}) {
  const label = (value: string) =>
    PARTICIPATION.find((entry) => entry.value === value)?.label ?? value;
  return (
    <div className="mt-2 space-y-2 text-zinc-700 dark:text-zinc-300">
      <p>
        <span className="text-zinc-500">Facilitator:</span>{" "}
        {nameOf(version.facilitator.agentId)}
      </p>
      <ul className="space-y-1">
        {version.members.map((member) => (
          <li key={member.agentId}>
            {nameOf(member.agentId)}{" "}
            <span className="text-zinc-500">
              · {label(member.participation).toLowerCase()}
              {member.when ? `: ${member.when}` : ""}
            </span>
            {member.role ? (
              <span className="block text-xs text-zinc-500">{member.role}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-zinc-500">
        Modes: {allowedModes(version.settings).join(", ")} (default{" "}
        {version.settings.defaultMode}) · discussions up to{" "}
        {version.discussion.maxRounds} round
        {version.discussion.maxRounds === 1 ? "" : "s"}
        {version.discussion.allowAgentResponses
          ? ", members respond to each other"
          : ", members answer independently"}
        {version.settings.requireSynthesis ? " · synthesis at the end" : ""}
      </p>
    </div>
  );
}
