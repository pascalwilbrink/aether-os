"use client";

import { themeOf, type Theme } from "@/lib/sidebar";

import { MonitorIcon, MoonIcon, SunIcon } from "./icons";
import { storeValue, useStoredValue } from "./stored-value";

const THEMES: { theme: Theme; label: string; Icon: typeof SunIcon }[] = [
  { theme: "system", label: "System", Icon: MonitorIcon },
  { theme: "light", label: "Light", Icon: SunIcon },
  { theme: "dark", label: "Dark", Icon: MoonIcon },
];

/** Puts the theme on <html>, where app/layout.tsx's script puts it on load. */
function applyTheme(theme: Theme) {
  document.documentElement.className = theme;
}

/** Light, dark or the system's: a class on <html> (see app/layout.tsx), remembered in this browser. */
export function ThemeSwitch() {
  const theme = themeOf(useStoredValue("iris-theme"));

  const choose = (next: Theme) => {
    applyTheme(next);
    storeValue("iris-theme", next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800"
    >
      {THEMES.map(({ theme: value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => choose(value)}
          className={`rounded-md p-1.5 ${
            theme === value
              ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          }`}
        >
          <Icon width={16} height={16} />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
