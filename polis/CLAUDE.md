# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Polis is the tenancy service of Aether-os (see `../CLAUDE.md`). It owns **organizations** (the tenant root; `active` or `suspended`) the **projects** inside them (`active` or `archived`, slug unique per organization), and **memberships** (planned: which user belongs to which organization, with what role; Pistis reads them to put organization and role claims in its tokens). The other services store organization and project IDs and resolve them here. Authentication (users, tokens, API keys) belongs to Pistis, which is not built yet; until it exists, `createdBy` is a plain request field.

Polis was split out of Hephaestus and shares its stack and conventions: NestJS 12 (ESM, TypeScript 6), TypeORM over better-sqlite3, pnpm.

## Commands

```bash
pnpm install                   # from the workspace root (../)
pnpm start:dev                 # watch mode, port $PORT (default 3001)
pnpm build
pnpm lint                      # oxlint --type-aware; no-floating-promises is an error
pnpm format                    # prettier (single quotes, trailing commas)
pnpm generate:api              # regenerate API types from @aether-os/contracts (../contracts/)polis.openapi.yaml

pnpm test                      # unit tests: **/*.spec.ts (vitest)
pnpm test:e2e                  # e2e tests: test/*.e2e-spec.ts, in-memory DB
pnpm test libs/projects/src/application/service/project.service.spec.ts   # single file
pnpm test -t "suspends"        # filter by test name
```

Shared infrastructure (Postgres, RabbitMQ, OpenBao, OPA, OTel, Jaeger, Langfuse) runs from `../docker-compose.yml`; see `../CLAUDE.md`.

## Database

- SQLite file at `data/polis.sqlite` (git-ignored; override with `DATABASE_PATH`; the e2e config sets `:memory:`).
- `synchronize: true` outside `NODE_ENV=production`: the schema is generated from entities and there are **no migrations** yet.
- Service specs are integration-style: they build a `Test.createTestingModule` with an in-memory `TypeOrmModule.forRoot` plus the feature module, rather than mocking repositories.

## Architecture

`src/` is only the app shell: `main.ts` calls Krepis's `configureHttpApp(app)` (the `/v1` prefix, the strict validation pipe and the problem details filter), and every e2e test calls it on the app it creates, before `init()`. Code lives in Nest libraries under `libs/`, registered in `nest-cli.json` and aliased in `tsconfig.json` as `@polis/<name>`; update both when adding a library.

Dependency graph: `core` ← `organizations` ← `projects`. Cross-module access goes through the exported **service** (e.g. `OrganizationService.findActiveById`), never another module's repositories.

**Target** (agreed, see `../docs/engineering.md`): controller → service → TypeORM repository, with an injected mapper per resource (DTO ↔ entity) and no separate domain layer or repository ports. The current code still uses the layering below; don't extend it, convert a library when you work on it.

Each feature lib currently uses this layering:

- `domain/`: aggregates with a private constructor, `static create()` and `static reconstitute()`; state in a private `props` object; transitions throw `DomainError` subclasses. Repository **ports** are abstract classes in `domain/repository/`, used directly as DI tokens.
- `application/service/`: use cases. Reads call `organizations.findById` (404 if missing); writes call `organizations.findActiveById` (`OrganizationSuspendedError` if suspended). Missing resources throw `NotFoundException`.
- `infrastructure/persistence/`: TypeORM `entity/`, `mapper/` (`toEntity` / `toDomain`, casting to branded IDs) and `TypeOrm*Repository` implementing the port, bound via `{ provide: XRepository, useClass: TypeOrmXRepository }`.
- `presentation/http/`: controllers and class-validator DTOs (`XResponse.fromDomain`); IDs come from `randomUUID()`. Target: DTOs generated as Zod schemas from the spec, `createZodDto` classes and a `ZodValidationPipe` (see `../docs/engineering.md`); don't add new class-validator DTOs.
- `index.ts`: the lib's public surface.

`libs/core` conventions (most of `@polis/core` is re-exported from the shared `@aether-os/krepis` package in `../krepis`; only `DatabaseModule` and the generated API types live in `libs/core`. Change shared code in Krepis and run `pnpm build` there; the copy here is refreshed automatically):

- **Branded IDs** (`OrganizationId`, `ProjectId`) come from Krepis.
- **Errors**: extend `DomainError(message, CODE)`; Krepis's `ProblemDetailsFilter` turns them into **HTTP 409** problem details with that `code` (and every other error into problem details too, see `../docs/api.md`). Add new codes to the spec's `DomainErrorCode` enum too.
- **Transactions**: `TransactionManager.run(work)` uses `AsyncLocalStorage`, and nested calls join the outer transaction. Repositories resolve their TypeORM `Repository` per call via `TypeOrmTransactionManager.getRepository(Entity)` (a getter, not a field).
- **Unique constraints**: catch with `isUniqueViolation(error)` in the repository and rethrow as a domain error (slug taken).
- **Pagination**: cursor (keyset) based: `@Query() PaginationQuery` (`limit` 1–100, default 50; opaque `cursor`) → `findPage(repository, { where, sortBy, direction }, page)` in the repository → `Page<T>` (`items`, `nextCursor`) → `PageResponse.fromPage(page, mapFn)`.

### API contract

Spec-first: the HTTP API is defined in `../contracts/polis.openapi.yaml`. `pnpm generate:api` reads it from the `@aether-os/contracts` workspace package and writes `libs/core/src/api/generated/polis-api.ts` (committed, never hand-edited). Every DTO declares `implements ApiSchema<'SchemaName'>` from `@polis/core`, so the build fails when a DTO drifts from the spec. This doesn't catch extra DTO fields the spec lacks, and the class-validator decorators must be kept in line with the spec's constraints by hand. To change an endpoint: edit the spec, regenerate, then update the DTO and controller.

### ESM

`"type": "module"` with `nodenext` resolution: relative imports need the `.js` extension. `main.ts` uses top-level `await`.
