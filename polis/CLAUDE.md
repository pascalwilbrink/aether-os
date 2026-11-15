# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Polis is the tenancy service of Aether-os (see `../CLAUDE.md`). It owns **organizations** (the tenant root; `active` or `suspended`) the **projects** inside them (`active` or `archived`, slug unique per organization), and **memberships**: which principal (a Pistis `sub` plus its `subjectType`, `user` or `service_account`) belongs to which organization, with one or more fixed roles (`owner`, `admin`, `member`, `viewer`; `docs/identity.md`). Pistis will read them (`GET /v1/memberships?subjectType=&subject=`) to put organization and role claims in its tokens. Not yet: project memberships and the project role cap, group mappings, protecting the last owner, and membership events. The other services store organization and project IDs and resolve them here. Authentication (users, tokens, API keys) belongs to Pistis, which is not built yet; until it exists, `createdBy` is a plain request field.

Polis is the reference implementation of `../docs/engineering.md`: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, `typeorm-transactional`, Postgres with migrations, and tests against Postgres in containers. New services copy it.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3001)
pnpm build
pnpm lint                      # oxlint --type-aware; no-floating-promises is an error
pnpm format                    # prettier (single quotes, trailing commas)
pnpm generate:api              # regenerate libs/core/src/api/generated from ../contracts/polis.openapi.yaml

pnpm migration:run             # apply pending migrations (on dist/: build first)
pnpm migration:show
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts

pnpm test                      # unit tests (libs/**/*.spec.ts): transitions, mappers, config; no database
pnpm test:e2e                  # integration (libs/**/*.int-spec.ts) and e2e (test/*.e2e-spec.ts) against Postgres; needs Docker
pnpm test libs/projects/src/project-transitions.spec.ts   # single file
pnpm test:e2e -t "archives"    # filter by test name
```

Shared infrastructure (Postgres, RabbitMQ, OpenBao, OPA, OTel, Jaeger, Langfuse) runs from `../docker-compose.yml`; see `../CLAUDE.md`.

## Configuration

Environment variables, validated at startup with the Zod schema in `libs/core/src/config/env.ts` (`polisConfigModule()`, through Krepis's `validateEnv`): `DATABASE_URL` (required, Postgres), `RABBITMQ_URL` (required, AMQP), `OUTBOX_RELAY_INTERVAL_MS` (1000; 0 turns the relay off), `PORT` (3001), `NODE_ENV`. Locally they come from `.env` (gitignored; `.env.example` has the defaults for `docker compose`).

## Database

- **Postgres**, Polis's own database (`polis` in `../docker-compose.yml`). Connection in `libs/core/src/database/database.module.ts`, using Krepis's `postgresOptions` (`snake_case` names, `synchronize` off) and `createTransactionalDataSource`.
- **Migrations only:** `src/database/migrations/` (registered in `migrations/index.ts`, oldest first), run by `pnpm migration:run` as a separate step, never at startup. The TypeORM CLI uses `src/database/data-source.ts`, compiled to `dist/`; list new entities there too. Generate migrations from the entities, review them, and keep them compatible with the previous release (expand, then contract); there are no down migrations.
- **Column conventions:** `uuid` IDs, `timestamptz`, `text`, enums as `text` with a check constraint (`ck_<table>_<column>`), unique constraints `uq_…` including `organization_id` where scoped, and an index matching each keyset pagination (`ix_…`).
- **Tests** run against Postgres 17.5 and RabbitMQ 4.1 (the compose versions) in containers started once per `test:e2e` run (`test/global-setup.ts`, via `@aether-os/krepis/testing`). The setup applies the migrations and fails if the entities differ from the migrated schema, so a missing migration fails the tests. Files run one at a time and every test starts from emptied tables (`test/database.ts`).

## Architecture

`src/` is the app shell: `main.ts` calls Krepis's `initializeTransactions()` before Nest boots and `configureHttpApp(app)` (the `/v1` prefix, the Zod validation pipe, the response serializer and the problem details filter); `app.module.ts` imports the config, database and feature modules. Code lives in Nest libraries under `libs/`, registered in `nest-cli.json` and aliased in `tsconfig.json` as `@polis/<name>`; update both when adding a library.

Dependency graph: `core` ← `organizations` ← `projects`, and `organizations` ← `memberships`. A library's `index.ts` exports its module, its service and its errors, never entities, mappers or repositories.

### A feature library

```
libs/projects/src/
  projects.module.ts        TypeOrmModule.forFeature([ProjectEntity]), controller, service, mapper
  projects.controller.ts    routes only: @Param/@Query/@Body DTOs, @ZodSerializerDto, one service call
  projects.service.ts       rules, @Transactional(), tenancy checks; returns response DTOs
  project.entity.ts         TypeORM entity (no logic)
  project.mapper.ts         DTO → entity (UUIDv7 generated here), entity → response
  project-transitions.ts    the lifecycle as a pure table, tested exhaustively
  project.errors.ts         DomainError subclasses (→ 409)
  dto/                      one line each: class X extends createZodDto(zX) {}
  index.ts
```

- **DTOs** are `createZodDto` classes over the schemas generated from the spec (`@polis/core` re-exports them as `zX`, and the types as `ApiTypes`). Requests are validated by Krepis's `ZodValidationPipe`: unknown fields are rejected, query strings are coerced, and path IDs must be UUIDs (`400 VALIDATION_FAILED` with `errors`). Responses go through `@ZodSerializerDto`, which strips anything not in the spec. Don't add class-validator DTOs; class-validator and class-transformer stay installed only because Krepis still needs them for Hephaestus.
- **Services** inject their own `Repository<Entity>` (`@InjectRepository`), their mapper and other services (never another module's repository); at most 7 dependencies. Every write is `@Transactional()`; nested calls join the outer transaction. Entities never leave a service: it returns response DTOs.
- **Tenancy:** reads of an organization's resources call `OrganizationsService.assertExists` (404); writes call `assertAcceptsWrites` (404, or `ORGANIZATION_SUSPENDED`), which takes a shared row lock so the organization can't be suspended halfway through the write. Project lookups always filter by `organizationId`, so another organization's project is a 404.
- **Memberships:** one per principal per organization (`MEMBERSHIP_EXISTS` otherwise). Roles are a Postgres `text[]` with a check constraint against the fixed set; the mapper stores and returns them deduplicated, highest first, so equal role sets look the same. `PUT` replaces the roles; `DELETE` removes the membership (`204`, then `404`). Like every write, these are rejected while the organization is suspended.
- **Events:** every change emits a typed event through `PolisEvents` (`@polis/core`, over Krepis's `DomainEvents`) inside the change's transaction, so it lands in the `outbox` table only if the change commits; the relay (Krepis `EventsModule`, configured in `app.module.ts`) publishes it to `polis.events`. Event types and payloads are generated from `../contracts/polis.asyncapi.yaml` into `libs/core/src/events/generated/` by `pnpm generate:api` (`aether-asyncapi-types` from `@aether-os/contracts`), so a payload that doesn't match the spec fails the build: change the spec first, then regenerate. Emit only when something changed, and bump the entity's `version` first: it's the event's `aggregateVersion`. Integration tests read the stored events with `test/outbox.ts`; `test/events.e2e-spec.ts` checks delivery to RabbitMQ, including the request's `traceparent` arriving as an AMQP header.
- **Versions in responses:** organization and project responses carry `version`, the same number as their events' `aggregateVersion`, so a consumer that fetches one (Hephaestus) can order it against events it receives.
- **Actions are idempotent** (`../docs/api.md`): suspending a suspended organization or archiving an archived project returns the unchanged resource with `200`.
- **Errors:** extend `DomainError(message, CODE)` in `<resource>.errors.ts`; Krepis's `ProblemDetailsFilter` turns them into `409` problem details with that `code`. Add new codes to the spec's `DomainErrorCode` enum too. Unique constraints are caught with `isUniqueViolation(error)` in the service and rethrown as a domain error (slug taken).
- **Pagination:** list DTOs carry `limit` / `cursor`; services call Krepis's `findPage(repository, { where, sortBy, direction }, page)` and `mapPage(…, mapper.toResponse)`, returning `{ items, nextCursor }`.

### API contract

Spec-first: `../contracts/polis.openapi.yaml`. `pnpm generate:api` runs `@hey-api/openapi-ts` (`openapi-ts.config.ts`: TypeScript types and Zod schemas) into `libs/core/src/api/generated/` (committed, formatted, never hand-edited). To change an endpoint: edit the spec, regenerate, then update the DTO classes, mapper and controller. CI fails if the generated files are out of date.

### ESM

`"type": "module"` with `nodenext` resolution: relative imports need the `.js` extension. `main.ts` uses top-level `await`.
