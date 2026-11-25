import { Suspense } from "react";

import { listDepartments, listProjects } from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import { orgPath } from "@/lib/pages";

import {
  ArchivedBadge,
  LinkList,
  Loading,
  PageHeader,
} from "../../../components/ui";

type Props = PageProps<"/orgs/[organizationId]/projects">;

/** The organization's projects, to manage who works in each. */
export default function Projects({ params }: Props) {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Who works in each project, with which role. Projects themselves are created and worked in in Iris."
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
    orgPath(organizationId, "/projects"),
  );
  const [projects, departments] = await Promise.all([
    listProjects(accessToken, organizationId),
    listDepartments(accessToken, organizationId),
  ]);
  const departmentName = new Map(departments.map((d) => [d.id, d.name]));

  return (
    <LinkList
      empty="No projects yet. Create one in Iris."
      items={projects.map((project) => ({
        id: project.id,
        href: orgPath(organizationId, `/projects/${project.id}`),
        label: project.name,
        detail: (
          <span className="inline-flex items-center gap-2">
            {project.departmentId
              ? departmentName.get(project.departmentId)
              : null}
            <ArchivedBadge status={project.status} />
          </span>
        ),
      }))}
    />
  );
}
