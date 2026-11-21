import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import { inputClass, secondaryButtonClass } from "@/app/components/form";
import { orUnavailable } from "@/lib/api/http";
import { getProject } from "@/lib/api/polis";
import {
  listKnowledgeItems,
  searchKnowledge,
  type KnowledgeItem,
} from "@/lib/api/seshat";
import { requireOrganization } from "@/lib/auth/current";
import {
  isKnowledgeItemStatus,
  isKnowledgeItemType,
  knowledgeStatus,
  matchedByLabel,
  sourceLabel,
  TYPES,
  typeLabel,
} from "@/lib/knowledge";
import { formatTime } from "@/lib/tasks";

import { decideKnowledgeItemAction } from "./actions";
import { NewKnowledgeItemForm, UploadDocumentForm } from "./knowledge-forms";

type Props = PageProps<"/orgs/[organizationId]/projects/[projectId]/knowledge">;

/** A project's knowledge (Seshat): search, proposals to review, every item, and adding more. */
export default function KnowledgePage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Knowledge {...props} />
    </Suspense>
  );
}

function StatusChip({ status }: { status: KnowledgeItem["status"] }) {
  const { label, classes } = knowledgeStatus(status);
  return (
    <span
      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {label}
    </span>
  );
}

async function Knowledge({ params, searchParams }: Props) {
  const { organizationId, projectId } = await params;
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const type = typeof query.type === "string" ? query.type : undefined;
  const status = typeof query.status === "string" ? query.status : undefined;
  const projectPath = `/orgs/${organizationId}/projects/${projectId}`;
  const path = `${projectPath}/knowledge`;
  const session = await requireOrganization(organizationId, path);
  const token = session.accessToken;
  const filter = {
    type: isKnowledgeItemType(type) ? type : undefined,
    status: isKnowledgeItemStatus(status) ? status : undefined,
  };
  const [project, items, proposals, found] = await Promise.all([
    getProject(token, organizationId, projectId),
    orUnavailable(listKnowledgeItems(token, organizationId, projectId, filter)),
    orUnavailable(
      listKnowledgeItems(token, organizationId, projectId, {
        status: "proposed",
      }),
    ),
    q
      ? searchKnowledge(token, organizationId, projectId, {
          query: q,
          includeProposed: true,
          limit: 20,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const ref = { organizationId, projectId };
  const filterHref = (next: { type?: string; status?: string }) => {
    const search = new URLSearchParams();
    const merged = { type: filter.type, status: filter.status, ...next };
    if (merged.type) search.set("type", merged.type);
    if (merged.status) search.set("status", merged.status);
    const text = search.toString();
    return text ? `${path}?${text}` : path;
  };
  const chip = (active: boolean) =>
    `rounded-full px-2 py-0.5 text-xs ${active ? "bg-indigo-600 text-white" : "border border-zinc-300 dark:border-zinc-700"}`;

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={projectPath} className="underline">
            {project.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Knowledge</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          What agents know about this project: its decisions, conventions,
          facts, architecture, lessons and documents. Agents search it while
          they work and propose what they learn; a person accepts it.
        </p>
      </div>

      {items.unavailable ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Knowledge can&apos;t be shown right now (Seshat isn&apos;t answering).
        </p>
      ) : null}

      <section className="space-y-3">
        <form action={path} className="flex flex-wrap items-end gap-2">
          <label className="block grow text-sm">
            Search by words and meaning
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="How do we deploy?"
              className={inputClass}
            />
          </label>
          <button type="submit" className={secondaryButtonClass}>
            Search
          </button>
        </form>
        {q && found === null ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Search isn&apos;t available right now.
          </p>
        ) : null}
        {found ? (
          found.results.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Nothing matches “{q}”.
            </p>
          ) : (
            <ul className="space-y-3">
              {found.results.map((result) => (
                <li
                  key={result.item.id}
                  className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                >
                  <Link
                    href={`${path}/${result.item.id}`}
                    className="font-medium hover:underline"
                  >
                    {result.item.title}
                  </Link>
                  <StatusChip status={result.item.status} />
                  <span className="ml-2 text-xs text-zinc-500">
                    {typeLabel(result.item.type)} · matched by{" "}
                    {matchedByLabel(result.matchedBy)}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                    {result.passage}
                  </p>
                </li>
              ))}
              {found.semantic ? null : (
                <li className="text-xs text-zinc-500">
                  Matched by words only: meaning isn&apos;t available right
                  now.
                </li>
              )}
            </ul>
          )
        ) : null}
      </section>

      {proposals.items.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-medium">
            Proposals to review ({proposals.items.length})
          </h2>
          <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {proposals.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div>
                  <Link
                    href={`${path}/${item.id}`}
                    className="font-medium hover:underline"
                  >
                    {item.title}
                  </Link>
                  <span className="ml-2 text-xs text-zinc-500">
                    {typeLabel(item.type)} · {sourceLabel(item)} ·{" "}
                    {formatTime(item.createdAt)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <ActionButton
                    action={decideKnowledgeItemAction.bind(null, {
                      ...ref,
                      itemId: item.id,
                      decision: "accept",
                    })}
                    label="Accept"
                    pendingLabel="Accepting…"
                    primary
                  />
                  <ActionButton
                    action={decideKnowledgeItemAction.bind(null, {
                      ...ref,
                      itemId: item.id,
                      decision: "reject",
                    })}
                    label="Reject"
                    pendingLabel="Rejecting…"
                    confirmText={`Reject “${item.title}”?`}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-medium">Everything</h2>
        <div className="flex flex-wrap gap-1">
          <Link href={filterHref({ type: undefined })} className={chip(!filter.type)}>
            All kinds
          </Link>
          {TYPES.map((entry) => (
            <Link
              key={entry.value}
              href={filterHref({ type: entry.value })}
              className={chip(filter.type === entry.value)}
            >
              {entry.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Link
            href={filterHref({ status: undefined })}
            className={chip(!filter.status)}
          >
            Any status
          </Link>
          {(["accepted", "proposed", "superseded", "retired", "rejected"] as const).map(
            (value) => (
              <Link
                key={value}
                href={filterHref({ status: value })}
                className={chip(filter.status === value)}
              >
                {knowledgeStatus(value).label}
              </Link>
            ),
          )}
        </div>
        {items.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {filter.type || filter.status
              ? "Nothing like that yet."
              : "No knowledge yet: write the first decision or convention below, or upload a document."}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {items.items.map((item) => (
              <li key={item.id} className="py-2">
                <Link
                  href={`${path}/${item.id}`}
                  className="font-medium hover:underline"
                >
                  {item.title}
                </Link>
                <StatusChip status={item.status} />
                <span className="ml-2 text-xs text-zinc-500">
                  {typeLabel(item.type)} · version {item.version} · updated{" "}
                  {formatTime(item.updatedAt)}
                  {item.tags.length > 0 ? ` · ${item.tags.join(", ")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-medium">Write something down</h2>
          <NewKnowledgeItemForm project={ref} />
        </section>
        <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-medium">Add a document</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Markdown, text, CSV, JSON and HTML are searchable by their text;
            other files by their title.
          </p>
          <UploadDocumentForm project={ref} />
        </section>
      </div>
    </div>
  );
}
