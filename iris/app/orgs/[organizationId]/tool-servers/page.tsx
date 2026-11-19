import Link from "next/link";
import { Suspense } from "react";

import { listToolServers } from "@/lib/api/hephaestus";
import { requireOrganization } from "@/lib/auth/current";
import { organizationRoles } from "@/lib/auth/claims";
import { authLabel } from "@/lib/tool-servers";

import { createToolServerAction } from "./actions";
import { ToolServerForm } from "./tool-server-form";

type Props = PageProps<"/orgs/[organizationId]/tool-servers">;

/** The organization's tool servers (MCP), which agent versions take tools from. */
export default function ToolServersPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ToolServers {...props} />
    </Suspense>
  );
}

async function ToolServers({ params }: Props) {
  const { organizationId } = await params;
  const session = await requireOrganization(organizationId, `/orgs/${organizationId}/tool-servers`);
  const servers = await listToolServers(session.accessToken, organizationId);
  const manages = organizationRoles(session.accessToken).some((role) => role === "owner" || role === "admin");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Tool servers</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          MCP servers your agents take tools from: choose them on an agent&apos;s version. Aether-os connects to them
          for each task, never from the agent&apos;s sandbox, and tells the agent that what they return is data, not
          instructions.
        </p>
      </div>

      {servers.items.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No tool servers yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {servers.items.map((server) => (
            <li key={server.id}>
              <Link
                href={`/orgs/${organizationId}/tool-servers/${server.id}`}
                className="block px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <span className="font-mono font-medium">{server.name}</span>
                {server.description ? (
                  <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-400">{server.description}</span>
                ) : null}
                <span className="block text-xs text-zinc-500">
                  {server.url} · {authLabel(server)}
                  {server.auth.type === "header" && !server.credential ? " · no credential set" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {manages ? (
        <section className="space-y-3">
          <h2 className="font-medium">Add a tool server</h2>
          <ToolServerForm action={createToolServerAction.bind(null, organizationId)} />
        </section>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Owners and admins add tool servers.</p>
      )}
    </div>
  );
}
