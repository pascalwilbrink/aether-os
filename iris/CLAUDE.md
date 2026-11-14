# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Iris

Iris is the web frontend for Aether-os (see `../CLAUDE.md`). It is a blank Next.js 16 app (App Router, React 19, TypeScript, Tailwind CSS v4, ESLint) managed with pnpm as part of the Aether-os workspace (run `pnpm install` from `../`), and will consume the Hephaestus REST API.

```bash
pnpm dev      # dev server (Turbopack)
pnpm build
pnpm lint
pnpm generate:api   # regenerate lib/api/generated from @aether-os/contracts (../contracts/hephaestus.openapi.yaml)
```

Hephaestus API types come from the shared OpenAPI spec in `../contracts/`. Import them from `@/lib/api` (`ApiSchema<'AgentResponse'>`, `Agent`, `ApiPaths`, …); the generated file is committed and must not be edited by hand.

Iris runs on port 3000; Polis defaults to 3001 and Hephaestus to 3002.
