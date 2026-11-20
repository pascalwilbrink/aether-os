import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import { BudgetForm, BudgetMeter } from "@/app/components/budget";
import { ModelKeyForm } from "@/app/components/model-key-form";
import type { AgentVersion } from "@/lib/api";
import {
  canPublish,
  versionStatusClasses,
  versionStatusLabel,
} from "@/lib/agents";
import { getAgent, listAgentVersions } from "@/lib/api/agora";
import {
  getAgentBudget,
  listActiveModels,
  listModelKeys,
  listOllamaModels,
  listSkills,
  listToolServers,
} from "@/lib/api/hephaestus";
import { getOrganization } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import {
  isSelfHosted,
  keyInUse,
  providerName,
  type ModelKey,
} from "@/lib/model-keys";
import { formatTime } from "@/lib/tasks";

import { ArchiveButton, PublishButton, VersionForm } from "../agent-forms";
import { setAgentBudgetAction } from "../../budget/actions";
import {
  deleteModelKeyAction,
  setModelKeyAction,
} from "../../model-keys/actions";

type Props = PageProps<"/orgs/[organizationId]/agents/[agentId]">;

/** An agent: its versions (newest first), publishing them, and writing the next one. */
export default function AgentPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <AgentDetails {...props} />
    </Suspense>
  );
}

async function AgentDetails({ params }: Props) {
  const { organizationId, agentId } = await params;
  const session = await requireOrganization(
    organizationId,
    `/orgs/${organizationId}/agents/${agentId}`,
  );
  const token = session.accessToken;
  const [
    organization,
    agent,
    versions,
    models,
    organizationKeys,
    agentKeys,
    budget,
    toolServers,
    skills,
  ] = await Promise.all([
    getOrganization(token, organizationId),
    getAgent(token, organizationId, agentId),
    listAgentVersions(token, organizationId, agentId),
    listActiveModels(token),
    listModelKeys(token, organizationId),
    listModelKeys(token, organizationId, agentId),
    getAgentBudget(token, organizationId, agentId),
    listToolServers(token, organizationId),
    listSkills(token, organizationId),
  ]);
  const ref = { organizationId, agentId };
  const [latest] = versions.items;
  // The organization's Ollama server's models, to choose from (none when it
  // has no server, or the server doesn't answer).
  const ollamaModels = organizationKeys.items.some(
    (key) => key.provider === "ollama",
  )
    ? await listOllamaModels(token, organizationId)
        .then((list) => list.items.map((model) => model.name))
        .catch((error: unknown) => {
          unstable_rethrow(error);
          return [];
        })
    : [];
  const published = versions.items.find(
    (version) => version.status === "published",
  );

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Link href={`/orgs/${organizationId}`} className="underline">
              {organization.name}
            </Link>
          </p>
          <h1 className="text-2xl font-semibold">
            {agent.name}{" "}
            {agent.status === "archived" ? (
              <span className="align-middle text-sm font-normal text-zinc-500">
                (archived)
              </span>
            ) : null}
          </h1>
          {agent.description ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {agent.description}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {published
              ? `New tasks run version ${published.version}.`
              : "No published version: tasks can't use this agent yet."}
          </p>
        </div>
        {agent.status === "active" ? <ArchiveButton agent={ref} /> : null}
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Versions</h2>
        {versions.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No versions yet: write the first one below.
          </p>
        ) : (
          <ul className="space-y-2">
            {versions.items.map((version) => (
              <li key={version.id}>
                <VersionDetails
                  version={version}
                  open={version.id === (published ?? latest).id}
                  publish={agent.status === "active" && canPublish(version)}
                  agent={ref}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {latest ? (
        <ModelKeySection
          organizationId={organizationId}
          agentId={agentId}
          provider={(published ?? latest).model.provider}
          organizationKeys={organizationKeys.items}
          agentKeys={agentKeys.items}
        />
      ) : null}

      <section id="budget" className="space-y-3">
        <div>
          <h2 className="font-medium">Budget</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            What this agent&apos;s model calls cost this month, in every
            project. When its limit is used up, its tasks pause until it&apos;s
            raised or the next month starts. Owners and admins set it.
          </p>
        </div>
        <BudgetMeter budget={budget} />
        {agent.status === "active" ? (
          <BudgetForm
            budget={budget}
            action={setAgentBudgetAction.bind(null, ref)}
          />
        ) : null}
      </section>

      {agent.status === "active" ? (
        <section className="space-y-3">
          <h2 className="font-medium">
            {latest
              ? `New version, from version ${latest.version}`
              : "First version"}
          </h2>
          {/* After a save, React resets the form to its defaults: the new latest version. */}
          <VersionForm
            agent={ref}
            from={latest}
            models={models.items}
            toolServers={toolServers.items}
            skills={skills.items}
            ollamaModels={ollamaModels}
          />
        </section>
      ) : null}
    </div>
  );
}

function VersionDetails({
  version,
  open,
  publish,
  agent,
}: {
  version: AgentVersion;
  open: boolean;
  publish: boolean;
  agent: { organizationId: string; agentId: string };
}) {
  const { model, runtime } = version;
  const settings = [
    `${model.provider} / ${model.model}`,
    model.temperature === undefined ? null : `temperature ${model.temperature}`,
    model.maxTokens === undefined ? null : `max ${model.maxTokens} tokens`,
    runtime.executionMode,
    runtime.sandboxRequired ? "sandbox" : "no sandbox",
  ].filter(Boolean);
  return (
    <details
      open={open}
      className="rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <span className="font-medium">Version {version.version}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${versionStatusClasses(version.status)}`}
        >
          {versionStatusLabel(version.status)}
        </span>
        <span className="text-zinc-500">{settings.join(" · ")}</span>
      </summary>
      <div className="space-y-3 border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
        <pre className="whitespace-pre-wrap rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
          {version.instructions}
        </pre>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <Fact label="Capabilities">
            {version.capabilities.join(", ") || "none"}
          </Fact>
          <Fact label="Tools">
            {version.tools
              .filter((tool) => tool.enabled)
              .map((tool) =>
                tool.tools
                  ? `${tool.name} (${tool.tools.join(", ")})`
                  : tool.name,
              )
              .join(", ") || "none"}
          </Fact>
          <Fact label="Skills">
            {version.skills
              .filter((skill) => skill.enabled)
              .map((skill) => `${skill.name} v${skill.version}`)
              .join(", ") || "none"}
          </Fact>
          <Fact label="Created">{formatTime(version.createdAt)}</Fact>
          <Fact label="Published">
            {version.publishedAt ? formatTime(version.publishedAt) : "never"}
          </Fact>
        </dl>
        {publish ? (
          <PublishButton version={{ ...agent, versionId: version.id }} />
        ) : null}
      </div>
    </details>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Which key the agent's model calls use, and its own key for that provider. */
function ModelKeySection({
  organizationId,
  agentId,
  provider,
  organizationKeys,
  agentKeys,
}: {
  organizationId: string;
  agentId: string;
  provider: string;
  organizationKeys: ModelKey[];
  agentKeys: ModelKey[];
}) {
  const name = providerName(provider);
  const inUse = keyInUse(provider, organizationKeys, agentKeys);
  const ref = { organizationId, provider, agentId };
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-medium">Model key</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {inUse.source === "agent" ? (
            <>
              Calls {name} with its own{" "}
              {inUse.baseUrl ? (
                <>
                  server <span className="font-mono">{inUse.baseUrl}</span>
                </>
              ) : (
                <>
                  key <span className="font-mono">{inUse.hint}</span>
                </>
              )}
              , instead of the organization&apos;s.
            </>
          ) : inUse.source === "organization" ? (
            <>
              Calls {name} with the{" "}
              <Link
                href={`/orgs/${organizationId}/model-keys`}
                className="underline"
              >
                organization&apos;s {inUse.baseUrl ? "server" : "key"}
              </Link>{" "}
              <span className="font-mono">{inUse.baseUrl ?? inUse.hint}</span>.{" "}
              {inUse.baseUrl
                ? "Give it its own to use another server."
                : `Give it its own to bill a separate ${name} account.`}
            </>
          ) : (
            <span className="text-amber-700 dark:text-amber-300">
              No {name} key: its tasks can&apos;t call the model. Set the{" "}
              <Link
                href={`/orgs/${organizationId}/model-keys`}
                className="underline"
              >
                organization&apos;s
              </Link>
              , or one for this agent below.
            </span>
          )}
        </p>
      </div>
      <ModelKeyForm
        action={setModelKeyAction.bind(null, ref)}
        label={
          isSelfHosted(provider)
            ? `This agent's ${name} API key (optional)`
            : `This agent's ${name} API key`
        }
        replacing={inUse.source === "agent"}
        baseUrl={
          isSelfHosted(provider)
            ? inUse.source === "agent"
              ? (inUse.baseUrl ?? "")
              : ""
            : undefined
        }
      />
      {inUse.source === "agent" ? (
        <ActionButton
          action={deleteModelKeyAction.bind(null, ref)}
          label="Use the organization's key"
          pendingLabel="Removing…"
          confirmText={`Remove this agent's own ${name} key? It uses the organization's again.`}
        />
      ) : null}
    </section>
  );
}
