import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import { getProject } from "@/lib/api/polis";
import {
  getKnowledgeItem,
  listKnowledgeItemPassages,
  listKnowledgeItemVersions,
} from "@/lib/api/seshat";
import { requireOrganization } from "@/lib/auth/current";
import { downloadHref, formatBytes } from "@/lib/files";
import {
  decisionsFor,
  knowledgeStatus,
  shortCommit,
  sourceLabel,
  typeLabel,
} from "@/lib/knowledge";
import { formatTime } from "@/lib/tasks";

import { decideKnowledgeItemAction } from "../actions";
import { EditKnowledgeItemForm } from "../knowledge-forms";

import { CopilotPageContext } from "@/app/components/page-context";

type Props =
  PageProps<"/orgs/[organizationId]/projects/[projectId]/knowledge/[itemId]">;

const DECISIONS = {
  accept: { label: "Accept", pending: "Accepting…", primary: true },
  reject: { label: "Reject", pending: "Rejecting…", primary: false },
  retire: { label: "Retire", pending: "Retiring…", primary: false },
} as const;

/** A knowledge item: what it says, where it came from, its versions, and reviewing or changing it. */
export default function KnowledgeItemPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <KnowledgeItemDetails {...props} />
    </Suspense>
  );
}

async function KnowledgeItemDetails({ params }: Props) {
  const { organizationId, projectId, itemId } = await params;
  const projectPath = `/orgs/${organizationId}/projects/${projectId}`;
  const path = `${projectPath}/knowledge`;
  const session = await requireOrganization(
    organizationId,
    `${path}/${itemId}`,
  );
  const token = session.accessToken;
  const [project, item, versions] = await Promise.all([
    getProject(token, organizationId, projectId),
    getKnowledgeItem(token, organizationId, projectId, itemId),
    listKnowledgeItemVersions(token, organizationId, projectId, itemId),
  ]);
  const passages = item.document
    ? await listKnowledgeItemPassages(token, organizationId, projectId, itemId)
    : null;
  const status = knowledgeStatus(item.status);
  const ref = { organizationId, projectId, itemId };
  const editable =
    item.type !== "document" && ["accepted", "proposed"].includes(item.status);
  const fromRepository = item.source.repository;

  return (
    <div className="space-y-10">
      <CopilotPageContext
        description="The knowledge item the person is looking at"
        value={{
          itemId: item.id,
          type: item.type,
          title: item.title,
          status: item.status,
          ...(item.body ? { body: item.body.slice(0, 4000) } : {}),
        }}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Link href={projectPath} className="underline">
              {project.name}
            </Link>{" "}
            /{" "}
            <Link href={path} className="underline">
              Knowledge
            </Link>
          </p>
          <h1 className="text-2xl font-semibold">
            {item.title}{" "}
            <span
              className={`ml-1 rounded-full px-2 py-0.5 align-middle text-xs font-medium ${status.classes}`}
            >
              {status.label}
            </span>
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {typeLabel(item.type)} · version {item.version} · {sourceLabel(item)}
            {item.source.taskId ? (
              <>
                {" "}
                (
                <Link
                  href={`${projectPath}/tasks/${item.source.taskId}`}
                  className="underline"
                >
                  its task
                </Link>
                )
              </>
            ) : null}
            {item.source.sessionId ? (
              <>
                {" "}
                (
                <Link
                  href={`${projectPath}/sessions/${item.source.sessionId}`}
                  className="underline"
                >
                  the session
                </Link>
                )
              </>
            ) : null}{" "}
            · updated {formatTime(item.updatedAt)}
            {item.acceptedBy ? ` · accepted by ${item.acceptedBy}` : ""}
          </p>
          {item.tags.length > 0 ? (
            <p className="mt-1 text-xs text-zinc-500">{item.tags.join(", ")}</p>
          ) : null}
          {item.supersededBy ? (
            <p className="mt-2 text-sm">
              Superseded by{" "}
              <Link
                href={`${path}/${item.supersededBy}`}
                className="underline"
              >
                a newer item
              </Link>
              .
            </p>
          ) : null}
          {item.supersedes ? (
            <p className="mt-2 text-sm">
              Replaces{" "}
              <Link href={`${path}/${item.supersedes}`} className="underline">
                an earlier item
              </Link>{" "}
              once accepted.
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {decisionsFor(item.status, item.source.kind).map((decision) => (
            <ActionButton
              key={decision}
              action={decideKnowledgeItemAction.bind(null, {
                ...ref,
                decision,
              })}
              label={DECISIONS[decision].label}
              pendingLabel={DECISIONS[decision].pending}
              primary={DECISIONS[decision].primary}
              confirmText={
                decision === "accept"
                  ? undefined
                  : `${DECISIONS[decision].label} “${item.title}”?`
              }
            />
          ))}
        </div>
      </div>

      {item.document ? (
        <section className="space-y-2 text-sm">
          <h2 className="font-medium">Document</h2>
          {fromRepository ? (
            <p className="text-zinc-600 dark:text-zinc-400">
              {fromRepository.path} in {fromRepository.fullName}, at{" "}
              {shortCommit(fromRepository.commit)}. Read-only here: change it
              with a commit, and it&apos;s read again after the push.
            </p>
          ) : null}
          <p>
            <a
              href={
                fromRepository
                  ? fromRepository.url
                  : downloadHref(
                      organizationId,
                      projectId,
                      item.document.fileId ?? "",
                    )
              }
              className="underline"
              {...(fromRepository
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
            >
              {item.document.fileName}
            </a>{" "}
            <span className="text-zinc-500">
              {item.document.contentType} ·{" "}
              {formatBytes(item.document.sizeBytes)} · indexing{" "}
              {item.document.indexing.status}
              {item.document.indexing.error
                ? `: ${item.document.indexing.error}`
                : ""}
            </span>
          </p>
          {passages && passages.items.length > 0 ? (
            <div className="max-h-[32rem] space-y-3 overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              {passages.items.map((passage) => (
                <p
                  key={passage.ordinal}
                  className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300"
                >
                  {passage.text}
                </p>
              ))}
              {passages.nextCursor ? (
                <p className="text-xs text-zinc-500">
                  The first {passages.items.length} parts;{" "}
                  {fromRepository ? "open it" : "download it"} for the rest.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="font-medium">What it says</h2>
          <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            {item.body}
          </div>
          {item.rationale ? (
            <>
              <h3 className="text-sm font-medium">Why</h3>
              <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                {item.rationale}
              </div>
            </>
          ) : null}
          {item.alternatives.length > 0 ? (
            <>
              <h3 className="text-sm font-medium">Also considered</h3>
              <ul className="space-y-1 text-sm">
                {item.alternatives.map((alternative) => (
                  <li key={alternative.option}>
                    <span className="font-medium">{alternative.option}</span>
                    <span className="text-zinc-600 dark:text-zinc-400">
                      : {alternative.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Versions</h2>
        <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {versions.items.map((version) => (
            <li key={version.version} className="py-2">
              <details>
                <summary className="cursor-pointer">
                  Version {version.version}: {version.title}{" "}
                  <span className="text-xs text-zinc-500">
                    by {version.createdBy}, {formatTime(version.createdAt)}
                  </span>
                </summary>
                {version.body ? (
                  <p className="mt-2 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                    {version.body}
                  </p>
                ) : version.document ? (
                  <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                    {version.document.repository
                      ? `${version.document.repository.path} at ${shortCommit(version.document.repository.commit)}`
                      : version.document.fileName}
                  </p>
                ) : null}
              </details>
            </li>
          ))}
        </ul>
      </section>

      {editable ? (
        <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-medium">Change it</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Every change is a new version; earlier ones stay above. For a
            decision that changed, write a new one instead.
          </p>
          <EditKnowledgeItemForm
            item={ref}
            defaults={{
              title: item.title,
              body: item.body,
              tags: item.tags.join(", "),
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
