import Link from "next/link";
import type { ReactNode } from "react";

/** A page's title, with what it's about and its actions beside it. */
export function PageHeader({
  title,
  description,
  back,
  children,
}: {
  title: string;
  description?: ReactNode;
  back?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className="mb-8 space-y-2">
      {back ? (
        <Link
          href={back.href}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description ? (
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{description}</p>
          ) : null}
        </div>
        {children ? <div className="flex gap-2">{children}</div> : null}
      </div>
    </div>
  );
}

/** A titled part of a page. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}

/** A bordered box (a form, a list). */
export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {children}
    </div>
  );
}

/** "Archived", for what no longer takes changes. */
export function ArchivedBadge({ status }: { status: string }) {
  return status === "archived" ? (
    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      Archived
    </span>
  ) : null;
}

/** A list of links (people, teams, departments), or what to say when empty. */
export function LinkList({
  items,
  empty,
}: {
  items: { id: string; href: string; label: string; detail?: ReactNode }[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          >
            <span className="font-medium">{item.label}</span>
            {item.detail ? (
              <span className="text-right text-sm text-zinc-500">{item.detail}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** What to show while a page's data loads. */
export function Loading() {
  return <p className="text-zinc-500">Loading…</p>;
}
