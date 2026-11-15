# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Hephaestus is the Aether-os service that runs agents (see `../CLAUDE.md`). Today it holds **agents** with immutable, numbered **versions** (instructions, model, tools, skills, runtime; draft → published → deprecated, one published at a time), and **workspaces**: sandboxed execution environments in a project, driven by user actions and provisioner callbacks. Organizations and projects belong to **Polis**: Hephaestus keeps only their status (`libs/tenancy`), from Polis's events, and asks Polis's API about one it hasn't seen yet.

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

Environment variables, validated at startup with the Zod schema in `libs/core/src/config/env.ts` (`hephaestusConfigModule()`, through Krepis's `validateEnv`): `DATABASE_URL` (required, Postgres), `POLIS_URL` (required, Polis's API), `RABBITMQ_URL` (required; Polis's events), `PISTIS_ISSUER` (required: whose tokens to trust), `PISTIS_JWKS` (optional: trusted keys instead, tests), `PISTIS_CLIENT_ID` (`hephaestus`) and `PISTIS_CLIENT_SECRET` (required: Hephaestus's own client at Pistis, for its calls to Polis), `OUTBOX_RELAY_INTERVAL_MS` (1000), `PORT` (3002), `NODE_ENV`. Locally they come from `.env` (gitignored; `.env.example` has the defaults for `docker compose`).

## Database

- **Postgres**, Hephaestus's own database (`hephaestus` in `../docker-compose.yml`), connected in `libs/core/src/database/database.module.ts` with Krepis's `postgresOptions` and `createTransactionalDataSource`.
- **Migrations only:** `src/database/migrations/` (registered in `migrations/index.ts`, oldest first), run by `pnpm migration:run` as a separate step, never at startup. The TypeORM CLI uses `src/database/data-source.ts` (compiled to `dist/`); list new entities there and in `test/global-setup.ts`. No down migrations: keep them compatible with the previous release.
- **Columns:** `uuid` IDs, `timestamptz`, `text`, enums as `text` with a check constraint, configuration objects as `jsonb`, and an index matching each keyset pagination.
- **Tests** run against Postgres 17.5 and RabbitMQ 4.1 in containers started once per `test:e2e` run (`test/global-setup.ts`): it applies the migrations and fails if the entities differ from the migrated schema. Files run one at a time; every test starts from emptied tables (`test/database.ts`). Tokens come from the run's `TestTokens` (`test/tokens.ts`, trusted through `PISTIS_JWKS` in `test/setup.ts`; `asMember` in `test/auth.ts`); integration tests use `actingAs(service, testPrincipal(...))`. Test apps replace `PolisClient` with `test/fake-polis.ts` (organizations and projects as Polis would return them) and deliver Polis's events through the real inbox (`deliverPolisEvent`, `organizationEvent`, `projectArchived`); `test/polis-events.e2e-spec.ts` goes through RabbitMQ.

## Architecture

`src/` is the app shell: `main.ts` calls Krepis's `initializeTransactions()` before Nest boots and `configureHttpApp(app)` (the `/v1` prefix, Zod validation, the response serializer, problem details); `app.module.ts` imports the config, database and feature modules. Code lives in Nest libraries under `libs/`, registered in `nest-cli.json` and aliased in `tsconfig.json` as `@hephaestus/<name>`.

Dependency graph: `core` ← `tenancy` ← `agents`, `workspaces`. A library's `index.ts` exports its module, services and errors, never entities, mappers or repositories.

Each feature library has the layout described in `../polis/CLAUDE.md`: `*.module.ts`, `*.controller.ts` (routes only), `*.service.ts` (rules, `@Transactional()`, tenancy; returns response DTOs), `*.entity.ts`, `*.mapper.ts` (UUIDv7 IDs), `*-transitions.ts` (the lifecycle as a pure table, tested exhaustively), `*.errors.ts` and one-line `createZodDto` classes in `dto/`.

- **Tenancy (`libs/tenancy`):** `OrganizationsService.assertExists` (reads: 404) and `assertAcceptsWrites` (writes: 404 or `ORGANIZATION_SUSPENDED`); workspaces are created through `ProjectsService.assertAcceptsWrites` (also `PROJECT_ARCHIVED`, and 404 for another organization's project). They read `organization_states` / `project_states`, Hephaestus's copy of Polis's state:
  - kept from Polis's events (`organization.created` / `.suspended` / `.reactivated`, `project.created` / `.archived`), consumed through Krepis's `EventsModule` subscription in `app.module.ts` (`POLIS_SUBSCRIPTIONS`; queue `hephaestus.polis-events`, inbox, retries, dead-lettering) and handled with `@OnDomainEvent('polis.<eventType>')`;
  - on a miss, fetched once from Polis's API through `PolisClient` (`HttpPolisClient`: the client generated from Polis's spec, 5 s timeout, one retry), which also covers organizations created before Hephaestus subscribed. Polis unreachable then is `503 UNAVAILABLE`;
  - every write is version-guarded (`aggregateVersion` for events, Polis's `version` for fetches): a late, repeated or older event never moves a state backwards.
  Everything is looked up within its organization, so another organization's resource is a 404.
- **Access** (`../docs/identity.md`, Krepis `AuthModule` in `app.module.ts`; `x-permission` in the spec): agents need `agent:read`, `agent:write` (create, archive, new versions) and `agent:publish`; `createdBy` is the caller's `sub`. Workspace routes need an organization token (`org:read`), and `WorkspacesService` checks the project permission once the project is known: `workspace:read` to read, `workspace:manage` to create (the body's project) and for user actions; lists hold only workspaces in projects the caller can read; provisioner callbacks have no caller and no check.
- **Calling Polis:** `HttpPolisClient` sends Hephaestus's own token (`ServiceTokens`: `ClientCredentialsServiceTokens` with `PISTIS_CLIENT_ID` / `PISTIS_CLIENT_SECRET`, scope `platform:read`); no token from Pistis is `503 UNAVAILABLE`, like Polis being down.
- **Agents and versions:** `AgentsService` owns agents, `AgentVersionsService` owns versions and reaches agents through `AgentsService`. Creating or publishing a version calls `lockForVersionChange`, which locks the agent row (`AGENT_ARCHIVED` for archived agents): concurrent requests for one agent take turns, so version numbers are gapless and only one version is published. Publishing deprecates the previous published version in the same transaction; publishing the published version returns it unchanged; a deprecated version can't be published (`AGENT_VERSION_INVALID_TRANSITION`). Archiving an agent is idempotent.
- **Workspaces:** `workspace-transitions.ts` lists every allowed (status, action) pair; anything else is `WORKSPACE_INVALID_TRANSITION`. Workspace transitions are strict, not idempotent. User actions (acquire, release, suspend, resume) need an active organization; destroy only an existing one (a suspended organization can still release resources); provisioner callbacks (`startProvisioning`, `markReady`, `markDestroyed`, `markFailed`, `expire`, service methods without HTTP routes) skip the check. `expiresAt` must be in the future (`WORKSPACE_INVALID_EXPIRY`).
- **Errors:** `DomainError` subclasses become `409` problem details with their `code`; add new codes to the spec's `DomainErrorCode` enum too.

### API contract

Spec-first: `../contracts/hephaestus.openapi.yaml`. `pnpm generate:api` runs `@hey-api/openapi-ts` (`openapi-ts.config.ts`) for Hephaestus's own types and Zod schemas (`libs/core/src/api/generated/`) and for a Polis HTTP client from `polis.openapi.yaml` (`libs/core/src/clients/polis/generated/`, exported as `PolisApi`), and `aether-asyncapi-types` for Polis's event payloads (`libs/core/src/events/generated/`, exported as `PolisEvents`). All committed, formatted, never hand-edited (the generated client is excluded from lint); Iris generates its types from the Hephaestus spec. To change an endpoint: edit the spec, regenerate (here and in `../iris`), then update the DTO classes, mapper and controller.

### ESM

`"type": "module"` with `nodenext` resolution: relative imports need the `.js` extension. `main.ts` uses top-level `await`.
