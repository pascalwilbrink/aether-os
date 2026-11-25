import { LogoIcon, ThemeSwitch } from "@aether-os/design";

import { THEME_KEY } from "@/lib/theme";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <span className="flex items-center gap-2 font-semibold">
          <LogoIcon className="size-6 text-indigo-600 dark:text-indigo-400" />
          Atlas
        </span>
        <ThemeSwitch storageKey={THEME_KEY} />
      </header>
      <main className="flex-1 space-y-4 py-12">
        <h1 className="text-2xl font-semibold">Atlas</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          A new Aether-os interface, built on its design system.
        </p>
      </main>
    </div>
  );
}
