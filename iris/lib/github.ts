import type { Installation, Repository, RepositoryLink } from "./api/proxenos";

/** Why connecting GitHub failed (`?github=failed&reason=`, from Proxenos), as people read it. */
const FAILURES: Record<string, string> = {
  expired: "Connecting took too long (over 10 minutes). Start again.",
  incomplete:
    "GitHub didn't finish the installation. Start again, and install the app on GitHub.",
  "not-allowed":
    "Your GitHub account can't manage that installation. Ask someone who can to connect it.",
  "not-found":
    "That connection was already used, or never started here. Start again.",
  "installation-taken":
    "That GitHub installation is connected to another organization already.",
  "github-unavailable": "GitHub couldn't be reached. Try again in a moment.",
};

/**
 * What to show after GitHub sent the person back (Proxenos adds `?github=`
 * and `&reason=` to the path Iris gave it), or null on an ordinary visit.
 */
export function connectResult(
  github: string | undefined,
  reason: string | undefined,
): { ok: boolean; message: string } | null {
  if (github === "connected") {
    return {
      ok: true,
      message:
        "GitHub is connected. Its repositories are below; link them to projects there.",
    };
  }
  if (github === "failed") {
    return {
      ok: false,
      message:
        (reason && FAILURES[reason]) ||
        "Connecting GitHub failed. Start again.",
    };
  }
  return null;
}

const INSTALLATION_STATUS: Record<Installation["status"], string> = {
  active: "Active",
  suspended:
    "Suspended on GitHub: no tasks can use its repositories until it's unsuspended",
  deleted: "Uninstalled on GitHub: its repositories are gone",
};

export const installationStatusLabel = (status: Installation["status"]) =>
  INSTALLATION_STATUS[status];

/** Which repositories an installation covers, as people read it. */
export const coverageLabel = (
  installation: Pick<Installation, "repositorySelection">,
) =>
  installation.repositorySelection === "all"
    ? "all repositories"
    : "selected repositories";

/** The organization's available repositories a project hasn't linked yet, by full name. */
export function linkableRepositories(
  repositories: Repository[],
  links: RepositoryLink[],
): Repository[] {
  const linked = new Set(links.map((link) => link.repository.id));
  return repositories
    .filter(
      (repository) =>
        repository.status === "available" && !linked.has(repository.id),
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** The repositories a task can work in: the project's links, by full name. */
export function repositoryChoices(
  links: RepositoryLink[],
): { id: string; name: string }[] {
  return links
    .filter((link) => link.repository.status === "available")
    .map((link) => ({ id: link.id, name: link.repository.fullName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
