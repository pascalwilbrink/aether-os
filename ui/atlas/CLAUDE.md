# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Atlas

Atlas is a second web interface for Aether-os (see `../../CLAUDE.md`), in `ui/` beside Iris (`../iris`) and the design system both are built with (`../design`, `@aether-os/design`): a Next.js 16 app (App Router, React 19, TypeScript, Tailwind CSS v4, ESLint, Cache Components on) in the pnpm workspace (run `pnpm install` from `../../`). Read `AGENTS.md` first: this Next.js differs from older versions (e.g. `proxy.ts` replaces middleware), and its guides are in `node_modules/next/dist/docs/`.

So far it is the shell: the theme (`app/layout.tsx` puts `themeScript(THEME_KEY)` in `<head>`, `ThemeSwitch` on the home page, remembered under `atlas-theme`, `lib/theme.ts`), `app/globals.css` importing `@aether-os/design/theme.css` after Tailwind, and `GET /health/live`. It calls no service yet.

```bash
pnpm dev            # dev server (Turbopack) on :3012 (the root's `pnpm start:dev` too, or ATLAS_PORT)
pnpm build
pnpm start          # production server on :3012
pnpm lint
pnpm test           # vitest: lib/**/*.test.ts
```

Take the look from `@aether-os/design` (form styles, icons, the theme), never by copying Iris's components; what both apps need and knows nothing about a service's data goes into `../design`. Its built package is what Atlas imports: after changing it, `pnpm build` there (or `pnpm dev`).
