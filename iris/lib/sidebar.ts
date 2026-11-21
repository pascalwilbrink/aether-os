/** Pure helpers for the organization sidebar (`app/orgs/[organizationId]/sidebar`). */

/** Up to two initials, for an avatar: "Ada Lovelace" → "AL", "acme" → "A". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length === 1
      ? [words[0][0]]
      : [words[0][0], words[words.length - 1][0]];
  return letters.join("").toUpperCase();
}

/** A project's dot colour: stable per project, from a small palette. */
const PROJECT_COLORS = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-fuchsia-500",
] as const;

export function projectColor(
  projectId: string,
): (typeof PROJECT_COLORS)[number] {
  let hash = 0;
  for (const char of projectId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

/** The highest organization role, for people to read; null without one. */
export function roleLabel(roles: readonly string[]): string | null {
  for (const role of ["owner", "admin", "member", "viewer"]) {
    if (roles.includes(role)) return ROLE_LABELS[role];
  }
  return null;
}

export type SidebarSection =
  | "home"
  | "inbox"
  | "projects"
  | "agents"
  | "templates"
  | "members"
  | "settings";

/** Which item a page belongs to, from its path. */
export function sectionOf(
  pathname: string,
  organizationId: string,
): SidebarSection {
  const base = `/orgs/${organizationId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const first = rest.split("/").filter(Boolean)[0];
  switch (first) {
    case undefined:
      return "home";
    case "notifications":
      return "inbox";
    case "projects":
      return rest.includes("/templates/") ? "templates" : "projects";
    case "agents":
    case "skills":
    case "councils":
      return "agents";
    case "templates":
      return "templates";
    case "members":
      return "members";
    case "settings":
    case "budget":
    case "model-keys":
    case "tool-servers":
    case "github":
      return "settings";
    default:
      return "home";
  }
}

/** The project a page is in, if any. */
export function projectOf(
  pathname: string,
  organizationId: string,
): string | null {
  const match = pathname.match(
    new RegExp(`^/orgs/${organizationId}/projects/([0-9a-f-]{36})`),
  );
  return match ? match[1] : null;
}

/** The status line: every service answered, or how many didn't. */
export function statusLine(down: readonly string[]): {
  ok: boolean;
  text: string;
} {
  if (down.length === 0) return { ok: true, text: "All systems operational" };
  return {
    ok: false,
    text:
      down.length === 1
        ? `${down[0]} is unreachable`
        : `${down.length} services unreachable`,
  };
}

export type Theme = "system" | "light" | "dark";

/** A stored theme, or the system's when there's none (or it's not one). */
export function themeOf(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}
