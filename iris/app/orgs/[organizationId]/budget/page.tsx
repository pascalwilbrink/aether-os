import Link from "next/link";
import { Suspense } from "react";

import { BudgetForm, BudgetMeter } from "@/app/components/budget";
import { getOrganizationBudget, getProjectBudget } from "@/lib/api/hephaestus";
import { getOrganization, listProjects } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { budgetSummary } from "@/lib/budgets";

import { setOrganizationBudgetAction } from "./actions";

type Props = PageProps<"/orgs/[organizationId]/budget">;

/** What the organization's model calls cost this month, its limit, and each project's. */
export default function BudgetPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Budgets {...props} />
    </Suspense>
  );
}

async function Budgets({ params }: Props) {
  const { organizationId } = await params;
  const session = await requireOrganization(organizationId, `/orgs/${organizationId}/budget`);
  const token = session.accessToken;
  const [organization, budget, projects] = await Promise.all([
    getOrganization(token, organizationId),
    getOrganizationBudget(token, organizationId),
    listProjects(token, organizationId),
  ]);
  const projectBudgets = await Promise.all(
    projects.items.map(async (project) => ({
      project,
      budget: await getProjectBudget(token, organizationId, project.id),
    })),
  );

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={`/orgs/${organizationId}`} className="underline">
            {organization.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Budget</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          What agents&apos; model calls cost, at the prices in force when they were made. The organization and each
          project can have a monthly limit (calendar months, UTC); a task tree can have one of its own. When a limit is
          used up, the tasks that count against it pause, and resume when it&apos;s raised or the next month starts.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">The organization</h2>
        <BudgetMeter budget={budget} />
        <BudgetForm budget={budget} action={setOrganizationBudgetAction.bind(null, organizationId)} />
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Projects</h2>
        {projectBudgets.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No projects you can see yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 font-normal">Project</th>
                <th className="py-1 font-normal">Spent this month</th>
                <th className="py-1 font-normal">Limit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {projectBudgets.map(({ project, budget: projectBudget }) => {
                const summary = budgetSummary(projectBudget);
                return (
                  <tr key={project.id}>
                    <td className="py-2 pr-2">
                      <Link
                        href={`/orgs/${organizationId}/projects/${project.id}#budget`}
                        className="font-medium hover:underline"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-2">
                      {summary.spent}
                      {summary.percent === null ? null : (
                        <span
                          className={
                            summary.tone === "exceeded"
                              ? "ml-2 text-red-700 dark:text-red-300"
                              : summary.tone === "warning"
                                ? "ml-2 text-amber-700 dark:text-amber-300"
                                : "ml-2 text-zinc-500"
                          }
                        >
                          {summary.percent}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-zinc-600 dark:text-zinc-400">{summary.limit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-xs text-zinc-500">A project&apos;s limit is set on its page.</p>
      </section>
    </div>
  );
}
