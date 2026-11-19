/**
 * The tour of Iris (`app/orgs/[organizationId]/sidebar/tour.tsx`): one step
 * per part of the sidebar, each pointing at the element marked
 * `data-tour="<target>"`, then what a first task needs. Pure, so the order,
 * the words and the positioning are tested.
 */

export interface TourLink {
  label: string;
  /** A path under the organization, e.g. `/model-keys`. */
  path: string;
}

export interface TourStep {
  id: string;
  /** The `data-tour` value of the element it points at; none: a centred card. */
  target: string | null;
  title: string;
  body: string;
  /** Numbered things to do, each with where to do it. */
  todo?: TourLink[];
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to Iris",
    body: "Aether-os runs AI agents on tasks in your projects: they write, code and check their own work, and people review what needs it. This short tour shows where everything is.",
  },
  {
    id: "organization",
    target: "organization",
    title: "Your organization",
    body: "Everything you see belongs to this organization. Switch to another of yours from this menu.",
  },
  {
    id: "inbox",
    target: "inbox",
    title: "Inbox",
    body: "What needs you: drafts to review, tasks of yours that failed or finished, paused work and budgets running low. The number is what's unread; the important ones are emailed too.",
  },
  {
    id: "projects",
    target: "projects",
    title: "Projects",
    body: "Where tasks run. Each project has its own tasks, automations, linked repositories, budget and access. Open Projects to see them all or create one; the dots mark unread notifications.",
  },
  {
    id: "agents",
    target: "agents",
    title: "Agents",
    body: "What does the work: instructions, a model and a runtime (with a sandbox and network access when it needs them), in versions. Tasks run the published version.",
  },
  {
    id: "templates",
    target: "templates",
    title: "Templates",
    body: "Tasks you start often, with inputs and a definition of done that is checked before a task can succeed.",
  },
  {
    id: "members",
    target: "members",
    title: "Members",
    body: "People and service accounts, and their roles. Tasks never run as a person: they run as a service account, which needs a role in the task's project.",
  },
  {
    id: "settings",
    target: "settings",
    title: "Settings",
    body: "The organization's monthly budget, its keys for model providers, connecting GitHub, and whether every Aether-os service is answering.",
  },
  {
    id: "you",
    target: "user",
    title: "You",
    body: "Your role, the theme (light, dark or your system's), switching organization and signing out. You can take this tour again from here.",
  },
  {
    id: "first-task",
    target: null,
    title: "Your first task",
    body: "A task needs these, once. Connecting GitHub (Settings) is only for tasks that work in a repository.",
    todo: [
      { label: "Add a key for your model provider", path: "/model-keys" },
      { label: "Create an agent and publish a version", path: "/agents/new" },
      { label: "Create a service account and give it a role in a project", path: "/members" },
      { label: "Open the project and start a task", path: "/projects" },
    ],
  },
];

/** The stored state: never seen (null) opens it, `done` keeps it closed, `open` reopens it. */
export const TOUR_KEY = "iris-tour";

export function tourOpen(stored: string | null): boolean {
  return stored !== "done";
}

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const GAP = 16;

/**
 * Where the card goes: to the right of the target, its top level with the
 * target's and kept inside the window; centred when there's no target, it
 * isn't visible (the sidebar is hidden on small screens), or there's no
 * room beside it.
 */
export function cardPosition(
  target: Rect | null,
  viewport: { width: number; height: number },
  card: { width: number; height: number },
): { top: number; left: number } | "center" {
  if (!target || target.width === 0 || target.height === 0) return "center";
  const left = target.right + GAP;
  if (left + card.width + GAP > viewport.width) return "center";
  const top = Math.min(Math.max(target.top, GAP), Math.max(GAP, viewport.height - card.height - GAP));
  return { top, left };
}
