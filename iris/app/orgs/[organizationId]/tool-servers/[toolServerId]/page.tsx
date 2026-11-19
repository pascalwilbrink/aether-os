import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import { ModelKeyForm } from "@/app/components/model-key-form";
import type { ToolSummary } from "@/lib/api";
import { getToolServer, listToolServerTools } from "@/lib/api/hephaestus";
import { ApiError } from "@/lib/api/http";
import { requireOrganization } from "@/lib/auth/current";
import { organizationRoles } from "@/lib/auth/claims";
import { formatTime } from "@/lib/tasks";
import { authLabel } from "@/lib/tool-servers";

import {
  deleteCredentialAction,
  deleteToolServerAction,
  setCredentialAction,
  updateToolServerAction,
} from "../actions";
import { ToolServerForm } from "../tool-server-form";

type Props = PageProps<"/orgs/[organizationId]/tool-servers/[toolServerId]">;

/** One tool server: what it offers now, its settings and its credential. */
export default function ToolServerPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ToolServerDetails {...props} />
    </Suspense>
  );
}

async function ToolServerDetails({ params }: Props) {
  const { organizationId, toolServerId } = await params;
  const path = `/orgs/${organizationId}/tool-servers/${toolServerId}`;
  const session = await requireOrganization(organizationId, path);
  const token = session.accessToken;
  const server = await getToolServer(token, organizationId, toolServerId);
  const manages = organizationRoles(token).some((role) => role === "owner" || role === "admin");
  const ref = { organizationId, toolServerId };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={`/orgs/${organizationId}/tool-servers`} className="underline">
            Tool servers
          </Link>
        </p>
        <h1 className="font-mono text-2xl font-semibold">{server.name}</h1>
        {server.description ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{server.description}</p> : null}
        <p className="mt-1 text-xs text-zinc-500">
          {server.url} · {authLabel(server)}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Tools it offers</h2>
        <Suspense fallback={<p className="text-sm text-zinc-500">Asking the server…</p>}>
          <Tools token={token} organizationId={organizationId} server={server} />
        </Suspense>
      </section>

      {server.auth.type === "header" ? (
        <section className="space-y-2">
          <h2 className="font-medium">Credential</h2>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {server.credential ? (
                <>
                  Set: <span className="font-mono">{server.credential.hint}</span> · by {server.credential.updatedBy}{" "}
                  on {formatTime(server.credential.updatedAt)}
                </>
              ) : (
                `Not set: tasks of agents that use ${server.name} fail until it is.`
              )}
            </p>
            {server.credential && manages ? (
              <ActionButton
                action={deleteCredentialAction.bind(null, ref)}
                label="Remove"
                pendingLabel="Removing…"
                confirmText={`Remove ${server.name}'s credential? Tasks that use it fail until there's a new one.`}
              />
            ) : null}
          </div>
          {manages ? (
            <ModelKeyForm
              action={setCredentialAction.bind(null, ref)}
              label={`Value of the ${server.auth.headerName} header`}
              replacing={Boolean(server.credential)}
            />
          ) : null}
        </section>
      ) : null}

      {manages ? (
        <>
          <section className="space-y-3">
            <h2 className="font-medium">Settings</h2>
            <ToolServerForm action={updateToolServerAction.bind(null, ref)} server={server} />
          </section>
          <section className="space-y-2">
            <h2 className="font-medium">Remove</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Agent versions that use it keep naming it: their tasks fail until a tool server with this name exists
              again.
            </p>
            <ActionButton
              action={deleteToolServerAction.bind(null, ref)}
              label="Remove tool server"
              pendingLabel="Removing…"
              confirmText={`Remove ${server.name} and its credential?`}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}

/** Asked of the server now, so it can be slow or fail on its own. */
async function Tools({
  token,
  organizationId,
  server,
}: {
  token: string;
  organizationId: string;
  server: { id: string; name: string };
}) {
  let tools: ToolSummary[];
  try {
    tools = (await listToolServerTools(token, organizationId, server.id)).items;
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      return <p className="text-sm text-amber-700 dark:text-amber-300">{error.message}</p>;
    }
    throw error;
  }
  if (tools.length === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">It offers no tools.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
      {tools.map((tool) => (
        <li key={tool.name} className="px-4 py-2">
          <span className="font-mono">
            {server.name}_{tool.name}
          </span>
          {tool.description ? <span className="block text-zinc-600 dark:text-zinc-400">{tool.description}</span> : null}
        </li>
      ))}
    </ul>
  );
}
