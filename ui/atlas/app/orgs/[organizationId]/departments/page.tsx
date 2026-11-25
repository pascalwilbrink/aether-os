import { Suspense } from "react";

import { listDepartments, listPersons, listTeams } from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import { orgPath, people, teamCount } from "@/lib/pages";

import {
  ArchivedBadge,
  Card,
  LinkList,
  Loading,
  PageHeader,
  Section,
} from "../../../components/ui";
import { createDepartmentAction } from "./actions";
import { DepartmentForm } from "./department-form";

type Props = PageProps<"/orgs/[organizationId]/departments">;

/** The organization's departments, and a new one. */
export default function Departments({ params }: Props) {
  return (
    <>
      <PageHeader
        title="Departments"
        description="Departments group the organization's projects, people and teams. A project is in at most one; people and teams in any."
      />
      <Suspense fallback={<Loading />}>
        <Content params={params} />
      </Suspense>
    </>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const { organizationId } = await params;
  const { accessToken } = await requireAdmin(
    organizationId,
    orgPath(organizationId, "/departments"),
  );
  const [departments, persons, teams] = await Promise.all([
    listDepartments(accessToken, organizationId),
    listPersons(accessToken, organizationId),
    listTeams(accessToken, organizationId),
  ]);
  const count = (items: { departmentIds: string[] }[], id: string) =>
    items.filter((item) => item.departmentIds.includes(id)).length;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[2fr_1fr]">
      <LinkList
        empty="No departments yet."
        items={departments.map((department) => ({
          id: department.id,
          href: orgPath(organizationId, `/departments/${department.id}`),
          label: department.name,
          detail: (
            <span className="inline-flex items-center gap-2">
              {people(count(persons, department.id))} ·{" "}
              {teamCount(count(teams, department.id))}
              <ArchivedBadge status={department.status} />
            </span>
          ),
        }))}
      />
      <Section title="New department">
        <Card>
          <DepartmentForm
            action={createDepartmentAction.bind(null, organizationId)}
            submitLabel="Create department"
          />
        </Card>
      </Section>
    </div>
  );
}
