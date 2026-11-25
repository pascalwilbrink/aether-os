import { Suspense } from "react";

import { listDepartments, listPersons } from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import { orgPath } from "@/lib/pages";

import {
  Card,
  LinkList,
  Loading,
  PageHeader,
  Section,
} from "../../../components/ui";
import { createPersonAction } from "./actions";
import { PersonForm } from "./person-form";

type Props = PageProps<"/orgs/[organizationId]/people">;

/** The organization's people, and someone new. */
export default function People({ params }: Props) {
  return (
    <>
      <PageHeader
        title="People"
        description="The people in the organization and its departments, each linked to the Aether-os user with their email address once they sign up."
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
    orgPath(organizationId, "/people"),
  );
  const [persons, departments] = await Promise.all([
    listPersons(accessToken, organizationId),
    listDepartments(accessToken, organizationId),
  ]);
  const departmentName = new Map(departments.map((d) => [d.id, d.name]));

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[3fr_2fr]">
      <LinkList
        empty="No one yet."
        items={persons.map((person) => ({
          id: person.id,
          href: orgPath(organizationId, `/people/${person.id}`),
          label: person.name,
          detail: (
            <>
              <span className="block">{person.role ?? person.email}</span>
              <span className="block text-xs">
                {[
                  ...person.departmentIds
                    .map((id) => departmentName.get(id))
                    .filter(Boolean),
                  person.userId ? null : "not signed up",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </>
          ),
        }))}
      />
      <Section title="Add someone">
        <Card>
          <PersonForm
            action={createPersonAction.bind(null, organizationId)}
            departments={departments}
            submitLabel="Add person"
          />
        </Card>
      </Section>
    </div>
  );
}
