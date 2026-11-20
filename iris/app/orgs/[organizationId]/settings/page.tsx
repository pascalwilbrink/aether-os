import Link from "next/link";
import { Suspense } from "react";

import { requireOrganization } from "@/lib/auth/current";

import { serviceStatuses } from "../sidebar/services";

type Props = PageProps<"/orgs/[organizationId]/settings">;

const SETTINGS = [
  {
    path: "budget",
    title: "Budget",
    text: "What model calls cost this month, and the organization's monthly limit.",
  },
  {
    path: "model-keys",
    title: "Model keys",
    text: "The organization's keys for model providers (write-only).",
  },
  {
    path: "tool-servers",
    title: "Tool servers",
    text: "MCP servers agents take tools from, and their credentials.",
  },
  {
    path: "github",
    title: "GitHub",
    text: "Connecting the GitHub App, and the repositories projects can link.",
  },
  {
    path: "members",
    title: "Members",
    text: "People and service accounts, and their roles.",
  },
] as const;

/** The organization's settings, and whether Aether-os's services answer. */
export default function SettingsPage({ params }: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: Pick<Props, "params">) {
  const { organizationId } = await params;
  await requireOrganization(organizationId, `/orgs/${organizationId}/settings`);
  const statuses = await serviceStatuses();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The organization&apos;s budget, keys and connections.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SETTINGS.map((setting) => (
          <li key={setting.path}>
            <Link
              href={`/orgs/${organizationId}/${setting.path}`}
              className="block h-full rounded-lg border border-zinc-200 p-4 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
            >
              <span className="block font-medium">{setting.title}</span>
              <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                {setting.text}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section id="status" className="space-y-2">
        <h2 className="font-medium">Services</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Whether each Aether-os service answers Iris right now. A page that
          needs one that doesn&apos;t says so.
        </p>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {statuses.map((status) => (
            <li
              key={status.name}
              className="flex items-center justify-between px-4 py-2"
            >
              <span>{status.name}</span>
              <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                <span
                  className={`size-2 rounded-full ${status.up ? "bg-emerald-600 dark:bg-emerald-400" : "bg-amber-500"}`}
                />
                {status.up ? "Answering" : "Unreachable"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
