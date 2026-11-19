import { decodeJwt } from "jose";

import { listNotifications } from "@/lib/api/kerykes";
import { getOrganization, listProjects, myMemberships } from "@/lib/api/polis";
import { currentSession } from "@/lib/auth/current";
import { roleLabel, statusLine } from "@/lib/sidebar";

import { serviceStatuses } from "./services";
import { SidebarView, type SidebarData } from "./sidebar-view";

/** The value of a call, or a fallback when the service can't answer (the sidebar never fails a page). */
const settled = <T,>(result: PromiseSettledResult<T>, fallback: T): T =>
  result.status === "fulfilled" ? result.value : fallback;

/**
 * What the sidebar shows, for someone signed in to this organization: its
 * name and the person's other organizations (Polis), its projects (Polis;
 * a dot on those with unread notifications), the unread count (Kerykes), the
 * person and their role (their token), and whether the services answer.
 * Without a session for the organization it renders nothing (the page signs
 * in again).
 */
export async function Sidebar({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const session = await currentSession();
  if (session?.organizationId !== organizationId) {
    return null;
  }
  const token = session.accessToken;
  const [organization, memberships, projects, unread, statuses] = await Promise.allSettled([
    getOrganization(token, organizationId),
    myMemberships(token, session.sub),
    listProjects(token, organizationId),
    listNotifications(token, organizationId, { unread: true, limit: 100 }),
    serviceStatuses(),
  ]);

  const unreadItems = settled(unread, null)?.items ?? null;
  const attention = new Set((unreadItems ?? []).map((notification) => notification.projectId));
  const claims = (() => {
    try {
      return decodeJwt(token);
    } catch {
      return {};
    }
  })();
  const roles = Array.isArray(claims.org_roles) ? claims.org_roles.map(String) : [];
  const down = settled(statuses, [])
    .filter((status) => !status.up)
    .map((status) => status.name);

  const data: SidebarData = {
    organization: {
      id: organizationId,
      name: settled(organization, null)?.name ?? "Organization",
    },
    organizations: settled(memberships, { items: [], nextCursor: null }).items.map((membership) => ({
      id: membership.organizationId,
      name: membership.organization.name,
    })),
    projects: settled(projects, { items: [], nextCursor: null })
      .items.filter((project) => project.status === "active")
      .map((project) => ({ id: project.id, name: project.name, attention: attention.has(project.id) })),
    unread: unreadItems === null ? null : unreadItems.length,
    user: { name: session.name, role: roleLabel(roles) },
    status: { ...statusLine(down), down },
  };
  return <SidebarView data={data} />;
}
