import type { ReactNode } from "react";

import { LogoIcon, ThemeSwitch } from "@aether-os/design";

import { THEME_KEY } from "@/lib/theme";

/** Pages outside an organization: signing in, choosing one. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <span className="flex items-center gap-2 font-semibold">
          <LogoIcon className="size-6 text-indigo-600 dark:text-indigo-400" />
          Atlas
        </span>
        <ThemeSwitch storageKey={THEME_KEY} />
      </header>
      <main className="flex-1 py-12">{children}</main>
    </div>
  );
}
