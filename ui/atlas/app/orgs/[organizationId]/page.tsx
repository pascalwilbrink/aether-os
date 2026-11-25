import Link from "next/link";
import { Suspense } from "react";

import { listDepartments, listPersons, listTeams } from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import { orgPath } from "@/lib/pages";

import { Loading, PageHeader } from "../../components/ui";

/** The organization at a glance: how many departments, teams and people. */
export default function Overview({
  params,
}: PageProps<"/orgs/[organizationId]">) {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Your organization's departments, teams and people."
      />
      <Suspense fallback={<Loading />}>
        <Counts params={params} />
      </Suspense>
    </>
  );
}

async function Counts({
  params,
}: Pick<PageProps<"/orgs/[organizationId]">, "params">) {
  const { organizationId } = await params;
  const { accessToken } = await requireAdmin(
    organizationId,
    orgPath(organizationId),
  );
  const [departments, teams, persons] = await Promise.all([
    listDepartments(accessToken, organizationId),
    listTeams(accessToken, organizationId),
    listPersons(accessToken, organizationId),
  ]);
  const active = <T extends { status: string }>(items: T[]) =>
    items.filter((item) => item.status === "active").length;

  const cards = [
    {
      href: "/departments",
      label: "Departments",
      count: active(departments),
      detail: "group projects, people and teams",
    },
    {
      href: "/teams",
      label: "Teams",
      count: active(teams),
      detail: "people working together",
    },
    {
      href: "/people",
      label: "People",
      count: persons.length,
      detail: `${persons.filter((person) => person.userId).length} signed up`,
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={orgPath(organizationId, card.href)}
          className="rounded-lg border border-zinc-200 bg-white p-5 hover:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500"
        >
          <p className="text-sm text-zinc-500">{card.label}</p>
          <p className="mt-1 text-3xl font-semibold">{card.count}</p>
          <p className="mt-1 text-sm text-zinc-500">{card.detail}</p>
        </Link>
      ))}
    </div>
  );
}
