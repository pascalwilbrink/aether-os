"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { path: "", label: "Overview" },
  { path: "/departments", label: "Departments" },
  { path: "/teams", label: "Teams" },
  { path: "/people", label: "People" },
];

/** The organization's sections, the current one marked. */
export function OrganizationNav({ organizationId }: { organizationId: string }) {
  const pathname = usePathname();
  const base = `/orgs/${organizationId}`;
  return (
    <nav className="flex gap-1 overflow-x-auto text-sm">
      {LINKS.map(({ path, label }) => {
        const href = base + path;
        const current = path === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={label}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 font-medium ${
              current
                ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
