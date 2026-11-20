import Link from "next/link";
import type { ReactNode } from "react";

import { LogoIcon } from "./icons";
import { ThemeSwitch } from "./theme-switch";

/** Pages outside an organization (signing in, choosing one): the logo on top, the page below. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <LogoIcon className="text-indigo-500" width={24} height={24} />
            <span className="text-lg font-semibold tracking-tight">iris</span>
            <span className="text-[10px] font-medium tracking-[0.2em] text-zinc-500">
              AETHER-OS
            </span>
          </Link>
          <ThemeSwitch />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </>
  );
}
