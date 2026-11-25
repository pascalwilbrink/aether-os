# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Design

`@aether-os/design` is Aether-os's design system (see `../../CLAUDE.md`): the shared look of its user interfaces, so Atlas (`../atlas`) looks like Iris (`../iris`) without copying it. It holds only what has nothing to do with any one service:

- `theme.css`: the theme for Tailwind CSS v4, imported after `tailwindcss` (`@import "@aether-os/design/theme.css"`). Dark mode follows the person's choice, a class on `<html>` (`light`, `dark` or `system`, which follows `prefers-color-scheme`), through a redefined `dark:` variant; it also tells Tailwind (`@source`) to read the package's built components for their classes.
- `theme.ts`: `Theme`, `themeOf` (a stored value, or `system`) and `themeScript(storageKey)`, the script an app puts in its `<head>` so the stored theme is on `<html>` before the first paint.
- `theme-switch.tsx`: `ThemeSwitch` (light, dark or the system's, remembered under the app's `storageKey`).
- `stored-value.ts`: `useStoredValue` / `storeValue`, a value remembered in the browser (`localStorage`) as React state that follows other tabs, through `useSyncExternalStore`.
- `form.tsx`: the form styles (`inputClass`, `buttonClass`, `secondaryButtonClass`) and `FormError`.
- `icons.tsx`: the line icons (24×24, stroked with the current colour), no icon library.

Iris's own components (task briefs, plan cards, editors, status badges for its statuses, the public shell) stay in Iris: what knows about a service's data or an app's pages doesn't belong here.

## Commands

```bash
pnpm install    # from the workspace root (../../); builds the package (`prepare`)
pnpm build      # tsc -> dist/ (ESM + .d.ts; "use client" kept)
pnpm dev        # tsc --watch
pnpm lint       # type-check
pnpm test       # vitest: src/**/*.test.ts
```

Consumers depend on it with `workspace:*` and import the built package (`@aether-os/design`, `dist/`), never `src/`, so it stays publishable like Krepis. After changing it, `pnpm build` here (or `pnpm dev`) before the app sees it. React is a peer dependency (the app's copy).
