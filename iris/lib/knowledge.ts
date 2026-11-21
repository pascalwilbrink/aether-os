import type { components } from "./api/generated/seshat-api";

type Schemas = components["schemas"];
export type KnowledgeItemType = Schemas["KnowledgeItemType"];
export type WritableKnowledgeItemType = Schemas["WritableKnowledgeItemType"];
export type KnowledgeItemStatus = Schemas["KnowledgeItemStatus"];
export type KnowledgeItem = Schemas["KnowledgeItemResponse"];
export type NewKnowledgeItem = Schemas["CreateKnowledgeItemRequest"];

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

/** What a person may do to an item now (Seshat checks `knowledge:approve`). */
export function decisionsFor(
  status: KnowledgeItemStatus,
): ("accept" | "reject" | "retire")[] {
  if (status === "proposed") return ["accept", "reject"];
  if (status === "accepted") return ["retire"];
  return [];
}

/** Where an item came from, in words. */
export function sourceLabel(item: Pick<KnowledgeItem, "source" | "createdBy">) {
  return item.source.kind === "task"
    ? "Proposed by an agent"
    : `Written by ${item.createdBy}`;
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
