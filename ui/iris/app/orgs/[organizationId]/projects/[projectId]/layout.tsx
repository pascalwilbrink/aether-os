import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { listAgents } from "@/lib/api/agora";
import { currentSession } from "@/lib/auth/current";

import { Copilot, type CopilotAgentOption } from "./copilot/copilot";

/** Every project page: the page, with the copilot beside it (`copilot/`). */
export default function ProjectLayout({
  children,
  params,
}: LayoutProps<"/orgs/[organizationId]/projects/[projectId]">) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ProjectCopilot params={params} />
      </Suspense>
    </>
  );
}

/** The copilot, once the agents it can talk to are known. */
async function ProjectCopilot({ params }: { params: Promise<{ organizationId: string }> }) {
  return <Copilot agents={await copilotAgents(params)} />;
}

/** Agents the copilot can talk to: active, with a published version; none when Agora doesn't answer. */
async function copilotAgents(
  params: Promise<{ organizationId: string }>,
): Promise<CopilotAgentOption[]> {
  const { organizationId } = await params;
  try {
    const session = await currentSession();
    if (!session || session.organizationId !== organizationId) return [];
    const { items } = await listAgents(session.accessToken, organizationId);
    return items
      .filter((agent) => agent.status === "active" && agent.latestVersionId)
      .map(({ id, name }) => ({ id, name }));
  } catch (error) {
    unstable_rethrow(error);
    return [];
  }
}
