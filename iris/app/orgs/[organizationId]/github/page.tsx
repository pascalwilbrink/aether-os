import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import { listInstallations, listRepositories, orUnavailable } from "@/lib/api/proxenos";
import { getOrganization } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { connectResult, coverageLabel, installationStatusLabel } from "@/lib/github";

import { connectGitHubAction, syncInstallationAction } from "./actions";

type Props = PageProps<"/orgs/[organizationId]/github">;

/** The organization's GitHub: connecting the app, its installations and the repositories they cover. */
export default function GitHubPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <GitHub {...props} />
    </Suspense>
  );
}

async function GitHub({ params, searchParams }: Props) {
  const { organizationId } = await params;
  const { github, reason } = await searchParams;
  const session = await requireOrganization(organizationId, `/orgs/${organizationId}/github`);
  const token = session.accessToken;
  const [organization, installations, repositories] = await Promise.all([
    getOrganization(token, organizationId),
    orUnavailable(listInstallations(token, organizationId)),
    orUnavailable(listRepositories(token, organizationId)),
  ]);
  const result = connectResult(single(github), single(reason));
  const accounts = new Map(installations.items.map((installation) => [installation.id, installation.account.login]));

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={`/orgs/${organizationId}`} className="underline">
            {organization.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">GitHub</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Install the Aether-os GitHub App on the accounts and repositories agents may work in, then link repositories
          to projects on each project&apos;s page. Agents never push to a default branch: their work arrives as pull
          requests from <code>aether/…</code> branches. Protecting your default branches on GitHub is still recommended.
        </p>
      </div>

      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={`rounded-md p-3 text-sm ${
            result.ok
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {result.message}
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Installations</h2>
          <ActionButton
            action={connectGitHubAction.bind(null, organizationId)}
            label={installations.items.length > 0 ? "Connect another account" : "Connect GitHub"}
            pendingLabel="Opening GitHub…"
            primary
          />
        </div>
        {installations.unavailable ? (
          <Unavailable />
        ) : installations.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            GitHub isn&apos;t connected yet. Connecting takes you to GitHub to choose an account and its repositories;
            you need to be an owner or admin here, and able to install apps on that GitHub account.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {installations.items.map((installation) => (
              <li key={installation.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div>
                  <span className="font-medium">{installation.account.login}</span>{" "}
                  <span className="text-zinc-500">
                    ({installation.account.type === "User" ? "user" : "organization"}, {coverageLabel(installation)})
                  </span>
                  <p
                    className={
                      installation.status === "active"
                        ? "text-zinc-600 dark:text-zinc-400"
                        : "text-amber-700 dark:text-amber-300"
                    }
                  >
                    {installationStatusLabel(installation.status)}
                  </p>
                </div>
                {installation.status === "deleted" ? null : (
                  <ActionButton
                    action={syncInstallationAction.bind(null, { organizationId, installationId: installation.id })}
                    label="Sync with GitHub"
                    pendingLabel="Syncing…"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Repositories</h2>
        {repositories.unavailable ? (
          <Unavailable />
        ) : repositories.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No repositories yet. Connect GitHub, or add repositories to the app&apos;s installation on GitHub and sync.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 font-normal">Repository</th>
                <th className="py-1 font-normal">Default branch</th>
                <th className="py-1 font-normal">Installation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {repositories.items.map((repository) => (
                <tr key={repository.id}>
                  <td className="py-2 pr-2">
                    {repository.fullName}
                    {repository.private ? <span className="ml-2 text-xs text-zinc-500">private</span> : null}
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs">{repository.defaultBranch}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">
                    {accounts.get(repository.installationId) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Unavailable() {
  return (
    <p className="text-sm text-amber-700 dark:text-amber-300">
      GitHub connections can&apos;t be shown right now (Proxenos isn&apos;t answering, or no GitHub App is set up yet).
    </p>
  );
}

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
