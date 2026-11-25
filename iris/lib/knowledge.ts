import type { components } from "./api/generated/seshat-api";

type Schemas = components["schemas"];
export type KnowledgeItemType = Schemas["KnowledgeItemType"];
export type WritableKnowledgeItemType = Schemas["WritableKnowledgeItemType"];
export type KnowledgeItemStatus = Schemas["KnowledgeItemStatus"];
export type KnowledgeItem = Schemas["KnowledgeItemResponse"];
export type NewKnowledgeItem = Schemas["CreateKnowledgeItemRequest"];
export type KnowledgeRepository = Schemas["KnowledgeRepositoryResponse"];

export const TYPES: { value: KnowledgeItemType; label: string; hint: string }[] = [
  { value: "decision", label: "Decision", hint: "A choice and why it was made" },
  { value: "convention", label: "Convention", hint: "How things are done here" },
  { value: "fact", label: "Fact", hint: "Something true about the project" },
  { value: "architecture", label: "Architecture", hint: "How the system is put together" },
  { value: "lesson", label: "Lesson", hint: "What went wrong or right, and what to do next time" },
  { value: "document", label: "Document", hint: "A file, indexed for search" },
];

/** The types a person writes (documents are uploaded). */
export const WRITABLE_TYPES = TYPES.filter(
  (type): type is (typeof TYPES)[number] & { value: WritableKnowledgeItemType } =>
    type.value !== "document",
);

export const typeLabel = (type: KnowledgeItemType) =>
  TYPES.find((entry) => entry.value === type)?.label ?? type;

export const isKnowledgeItemType = (
  value: string | undefined,
): value is KnowledgeItemType => TYPES.some((type) => type.value === value);

const STATUS: Record<KnowledgeItemStatus, { label: string; classes: string }> = {
  proposed: {
    label: "Proposed",
    classes: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  accepted: {
    label: "Accepted",
    classes:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  rejected: {
    label: "Rejected",
    classes: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
  superseded: {
    label: "Superseded",
    classes: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
  retired: {
    label: "Retired",
    classes: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
};
export const knowledgeStatus = (status: KnowledgeItemStatus) => STATUS[status];

export const isKnowledgeItemStatus = (
  value: string | undefined,
): value is KnowledgeItemStatus => value !== undefined && value in STATUS;

/**
 * What a person may do to an item now (Seshat checks `knowledge:approve`);
 * nothing to a repository's document, which changes with a commit.
 */
export function decisionsFor(
  status: KnowledgeItemStatus,
  sourceKind: KnowledgeItem["source"]["kind"] = "person",
): ("accept" | "reject" | "retire")[] {
  if (sourceKind === "repository") return [];
  if (status === "proposed") return ["accept", "reject"];
  if (status === "accepted") return ["retire"];
  return [];
}

/** Where an item came from, in words. */
export function sourceLabel(item: Pick<KnowledgeItem, "source" | "createdBy">) {
  if (item.source.kind === "repository") {
    return `From ${item.source.repository?.fullName ?? "a repository"}`;
  }
  if (item.source.kind === "session") return "Proposed in a council session";
  return item.source.kind === "task"
    ? "Proposed by an agent"
    : `Written by ${item.createdBy}`;
}

/** A commit's short form, as GitHub shows it. */
export const shortCommit = (commit: string | null | undefined) =>
  commit ? commit.slice(0, 7) : "";

/** The most paths a repository indexes (Seshat's limit). */
const MAX_PATHS = 20;

/**
 * A repository's paths to index, typed one per line (or comma-separated):
 * folders end in `/`, anything else is one file; relative to the
 * repository's root, without `..`.
 */
export function pathsFromText(
  text: string | undefined,
): { paths: string[] } | { error: string } {
  const paths = [
    ...new Set(
      (text ?? "")
        .split(/[\n,]/)
        .map((path) => path.trim())
        .filter(Boolean),
    ),
  ];
  if (paths.length === 0) {
    return { error: "Give at least one folder (ending in /) or file." };
  }
  if (paths.length > MAX_PATHS) {
    return { error: `At most ${MAX_PATHS} paths.` };
  }
  for (const path of paths) {
    if (path.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(path)) {
      return {
        error: `Paths are relative to the repository's root, without "..": not "${path}".`,
      };
    }
    if (path.length > 500) {
      return { error: "A path is at most 500 characters." };
    }
  }
  return { paths };
}

/** A repository's indexing state, in words and colour. */
export function repositoryStatus(status: KnowledgeRepository["status"]) {
  return {
    pending: {
      label: "Reading",
      classes:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    },
    synced: {
      label: "Up to date",
      classes:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    },
    failed: {
      label: "Failed",
      classes: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    },
  }[status];
}

/** Tags from a comma-separated field: trimmed, without empties or repeats. */
export function tagsOf(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

/** The request for a new written item from its form, or what's wrong with it. */
export function newItemOf(
  values: Record<string, string>,
): { request: NewKnowledgeItem } | { error: string } {
  const type = values.type as WritableKnowledgeItemType;
  if (!WRITABLE_TYPES.some((entry) => entry.value === type)) {
    return { error: "Choose what kind of knowledge it is." };
  }
  const title = (values.title ?? "").trim();
  const body = (values.body ?? "").trim();
  if (!title) return { error: "Give it a title." };
  if (!body) return { error: "Write what it says." };
  const tags = tagsOf(values.tags);
  if (tags.some((tag) => tag.length > 40)) {
    return { error: "Tags are at most 40 characters each." };
  }
  return { request: { type, title, body, ...(tags.length ? { tags } : {}) } };
}

/** How a search result matched, in words. */
export function matchedByLabel(matchedBy: ("keyword" | "semantic")[]): string {
  if (matchedBy.length === 2) return "words and meaning";
  return matchedBy[0] === "keyword" ? "words" : "meaning";
}
