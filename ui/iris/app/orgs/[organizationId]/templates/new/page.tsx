import Link from "next/link";
import { Suspense } from "react";

import { TemplateForm } from "@/app/components/template-form";
import { requireOrganization } from "@/lib/auth/current";

import { createTemplateAction } from "../actions";
import { templateFormOptions } from "../options";

type Props = PageProps<"/orgs/[organizationId]/templates/new">;

/** A new organization-wide template: every project can start tasks from it. */
export default function NewTemplatePage({ params }: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <NewTemplate params={params} />
    </Suspense>
  );
}

async function NewTemplate({ params }: Pick<Props, "params">) {
  const { organizationId } = await params;
  const session = await requireOrganization(
    organizationId,
    `/orgs/${organizationId}/templates/new`,
  );
  const options = await templateFormOptions(
    session.accessToken,
    organizationId,
    null,
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link
            href={`/orgs/${organizationId}/templates`}
            className="underline"
          >
            Templates
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">New organization template</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Every project can start tasks from it, and a project&apos;s own
          template can extend it. Knowledge belongs to a project, so a
          project&apos;s template pins it.
        </p>
      </div>
      <TemplateForm
        action={createTemplateAction.bind(null, {
          organizationId,
          projectId: null,
        })}
        creating
        agents={options.agents}
        submitLabel="Create template"
      />
    </div>
  );
}
