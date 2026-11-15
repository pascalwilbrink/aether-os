# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Hephaestus is the Aether-os service that runs agents (see `../CLAUDE.md`). Today it holds **agents** with immutable, numbered **versions** (instructions, model, tools, skills, runtime; draft → published → deprecated, one published at a time), and **workspaces**: sandboxed execution environments in a project, driven by user actions and provisioner callbacks. It also still holds its own copies of **organizations** and **projects**, ported from Polis; they're to be replaced by Polis (calls and its events).

Target role: Hephaestus becomes the task runner. Agents move to Agora; Hephaestus gains tasks and runs them with [Mastra](https://mastra.ai) as the agent runtime and sandbox layer, behind injected interfaces.

It follows `../docs/engineering.md` like Polis: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, `typeorm-transactional`, Postgres with migrations, tests against Postgres in containers.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3002)
pnpm build
pnpm lint                      # oxlint --type-aware; no-floating-promises is an error
pnpm format                    # prettier (single quotes, trailing commas)
pnpm generate:api              # regenerate libs/core/src/api/generated from ../contracts/hephaestus.openapi.yaml

pnpm migration:run             # apply pending migrations (on dist/: build first)
pnpm migration:show
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts

pnpm test                      # unit tests (libs/**/*.spec.ts): transition tables, mappers, config; no database
pnpm test:e2e                  # integration (libs/**/*.int-spec.ts) and e2e (test/*.e2e-spec.ts) against Postgres; needs Docker
pnpm test libs/workspaces/src/workspace-transitions.spec.ts   # single file
pnpm test:e2e -t "publishes"   # filter by test name
```

## Configuration

Environment variables, validated at startup with the Zod schema in `libs/core/src/config/env.ts` (`hephaestusConfigModule()`, through Krepis's `validateEnv`): `DATABASE_URL` (required, Postgres), `PORT` (3002), `NODE_ENV`. Locally they come from `.env` (gitignored; `.env.example` has the defaults for `docker compose`).

## Database

- **Postgres**, Hephaestus's own database (`hephaestus` in `../docker-compose.yml`), connected in `libs/core/src/database/database.module.ts` with Krepis's `postgresOptions` and `createTransactionalDataSource`.
- **Migrations only:** `src/database/migrations/` (registered in `migrations/index.ts`, oldest first), run by `pnpm migration:run` as a separate step, never at startup. The TypeORM CLI uses `src/database/data-source.ts` (compiled to `dist/`); list new entities there and in `test/global-setup.ts`. No down migrations: keep them compatible with the previous release.
- **Columns:** `uuid` IDs, `timestamptz`, `text`, enums as `text` with a check constraint, configuration objects as `jsonb`, and an index matching each keyset pagination.
- **Tests** run against Postgres 17.5 in a container started once per `test:e2e` run (`test/global-setup.ts`): it applies the migrations and fails if the entities differ from the migrated schema. Files run one at a time; every test starts from emptied tables (`test/database.ts`).

## Architecture

`src/` is the app shell: `main.ts` calls Krepis's `initializeTransactions()` before Nest boots and `configureHttpApp(app)` (the `/v1` prefix, Zod validation, the response serializer, problem details); `app.module.ts` imports the config, database and feature modules. Code lives in Nest libraries under `libs/`, registered in `nest-cli.json` and aliased in `tsconfig.json` as `@hephaestus/<name>`.

Dependency graph: `core` ← `organizations` ← `projects`; `organizations` ← `agents`; `organizations`, `projects` ← `workspaces`. A library's `index.ts` exports its module, services and errors, never entities, mappers or repositories.

Each feature library has the layout described in `../polis/CLAUDE.md`: `*.module.ts`, `*.controller.ts` (routes only), `*.service.ts` (rules, `@Transactional()`, tenancy; returns response DTOs), `*.entity.ts`, `*.mapper.ts` (UUIDv7 IDs), `*-transitions.ts` (the lifecycle as a pure table, tested exhaustively), `*.errors.ts` and one-line `createZodDto` classes in `dto/`.

- **Tenancy:** reads call `OrganizationsService.assertExists` (404); writes call `assertAcceptsWrites` (404 or `ORGANIZATION_SUSPENDED`, holding a shared lock on the organization). Workspaces are created through `ProjectsService.assertAcceptsWrites` (also `PROJECT_ARCHIVED`). Everything is looked up within its organization, so another organization's resource is a 404.
- **Agents and versions:** `AgentsService` owns agents, `AgentVersionsService` owns versions and reaches agents through `AgentsService`. Creating or publishing a version calls `lockForVersionChange`, which locks the agent row (`AGENT_ARCHIVED` for archived agents): concurrent requests for one agent take turns, so version numbers are gapless and only one version is published. Publishing deprecates the previous published version in the same transaction; publishing the published version returns it unchanged; a deprecated version can't be published (`AGENT_VERSION_INVALID_TRANSITION`). Archiving an agent is idempotent.
- **Workspaces:** `workspace-transitions.ts` lists every allowed (status, action) pair; anything else is `WORKSPACE_INVALID_TRANSITION`. Workspace transitions are strict, not idempotent. User actions (acquire, release, suspend, resume) need an active organization; destroy only an existing one (a suspended organization can still release resources); provisioner callbacks (`startProvisioning`, `markReady`, `markDestroyed`, `markFailed`, `expire`, service methods without HTTP routes) skip the check. `expiresAt` must be in the future (`WORKSPACE_INVALID_EXPIRY`).
- **Errors:** `DomainError` subclasses become `409` problem details with their `code`; add new codes to the spec's `DomainErrorCode` enum too.

### API contract

Spec-first: `../contracts/hephaestus.openapi.yaml`. `pnpm generate:api` runs `@hey-api/openapi-ts` (`openapi-ts.config.ts`: types and Zod schemas) into `libs/core/src/api/generated/` (committed, formatted, never hand-edited); Iris generates its types from the same spec. To change an endpoint: edit the spec, regenerate (here and in `../iris`), then update the DTO classes, mapper and controller.

### ESM

`"type": "module"` with `nodenext` resolution: relative imports need the `.js` extension. `main.ts` uses top-level `await`.
