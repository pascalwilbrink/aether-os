# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Hephaestus is a NestJS 12 (ESM, TypeScript 6) backend for managing AI agents: organizations own projects and agents; agents have immutable, versioned configurations (model, tools, skills, runtime); workspaces are sandboxed execution environments tied to a project. Persistence is TypeORM over better-sqlite3. The README is the unmodified Nest starter and has no project-specific info.

Target role (see `../CLAUDE.md`): Hephaestus becomes the task runner. Agents move to Agora and organizations/projects to Polis; Hephaestus gains tasks and runs them with [Mastra](https://mastra.ai) as the agent runtime and sandbox layer, behind ports in its domain layer.

## Commands

Package manager is **pnpm**.

```bash
pnpm install                   # from the workspace root (../)
pnpm start:dev                 # watch mode, port $PORT (default 3002)
pnpm build                     # nest build -> dist/
pnpm lint                      # oxlint --type-aware over src/ libs/ test/
pnpm format                    # prettier (single quotes, trailing commas)
pnpm generate:api              # regenerate API types from @aether-os/contracts (../contracts/)hephaestus.openapi.yaml

pnpm test                      # unit tests: **/*.spec.ts (vitest)
pnpm test:e2e                  # e2e tests: test/*.e2e-spec.ts, in-memory DB
pnpm test libs/agents/src/application/service/agent.service.spec.ts   # single file
pnpm test -t "publishes"    # filter by test name
pnpm test:e2e test/agents.e2e-spec.ts
```

Lint enforces `typescript/no-floating-promises` as an error.

## Database

- SQLite file at `data/hephaestus.sqlite` (override with `DATABASE_PATH`; e2e config sets `:memory:`).
- `synchronize: true` outside `NODE_ENV=production` — schema is generated from entities, there are **no migrations** yet. Changing an entity changes the dev DB schema on next start.
- Unit "service" specs are integration-style: they build a `Test.createTestingModule` with an in-memory `TypeOrmModule.forRoot` plus the feature module, rather than mocking repositories.

## Architecture

### Monorepo layout

`src/` is just the app shell (`AppModule` wires a global `ValidationPipe` with `whitelist`/`forbidNonWhitelisted`/`transform`, and the global `DomainErrorFilter`). All real code lives in Nest libraries under `libs/`, registered in `nest-cli.json` and aliased in `tsconfig.json` as `@hephaestus/<name>`. When adding a library, update both files (vitest resolves aliases via `resolve.tsconfigPaths`).

Module dependency graph: `core` ← `organizations` ← `projects` ← `workspaces`; `agents` depends on `organizations`. Cross-module access goes through the other module's exported **service** (e.g. `OrganizationService.findActiveById`), never its repositories.

### Per-module layering (DDD / hexagonal)

Each feature lib follows the same structure — copy an existing module (e.g. `libs/agents`) when adding one:

- `domain/` — aggregate classes with a private constructor, `static create()` (new, sets defaults/status) and `static reconstitute()` (from persistence). State lives in a private `props` object; getters return copies (`structuredClone`) of nested data. State transitions are methods that throw `DomainError` subclasses on invalid transitions. Repository **ports** are abstract classes in `domain/repository/` (used directly as Nest DI tokens).
- `application/service/` — use-case services. Convention: reads call `organizations.findById` (404 if missing); writes call `organizations.findActiveById` (throws `OrganizationSuspendedError` if suspended). Missing resources throw Nest `NotFoundException`.
- `infrastructure/persistence/` — TypeORM `entity/`, `mapper/` (`toEntity` / `toDomain`, casting raw strings back to branded IDs), and `repository/TypeOrm*Repository` implementing the port. Bound in the module via `{ provide: XRepository, useClass: TypeOrmXRepository }`.
- `presentation/http/` — controllers and class-validator request/response DTOs (`XResponse.fromDomain`). Controllers generate IDs with `randomUUID()`. Routes are nested under `organizations/:organizationId/...`.
- `index.ts` — public surface of the lib; export anything other libs need.

### Core conventions (`libs/core` and Krepis)

Most of `@hephaestus/core` is re-exported from the shared `@aether-os/krepis` package (`../krepis`); only the service-specific IDs (`AgentId`, `AgentVersionId`, `ExecutionId`, `WorkspaceId`), `DatabaseModule` and the generated API types live in `libs/core` itself. Change shared code in Krepis and run `pnpm build` there; the copy here is refreshed automatically.


- **Branded IDs**: `OrganizationId` and `ProjectId` come from Krepis; Hephaestus-only IDs are in `core/src/id/id.ts`.
- **Errors**: extend `DomainError(message, CODE)`. `DomainErrorFilter` maps every `DomainError` to **HTTP 409** with `{ statusCode, error: code, message }`.
- **Transactions**: `TransactionManager.run(work)` uses `AsyncLocalStorage`; nested calls join the outer transaction. TypeORM repositories must resolve their `Repository` per call via `TypeOrmTransactionManager.getRepository(Entity)` (a getter, not a field) so they participate in the active transaction. Modules import `TransactionModule` and still register entities with `TypeOrmModule.forFeature` (for `autoLoadEntities`).
- **Unique constraints**: catch with `isUniqueViolation(error)` in the repository and rethrow as a domain error (see agent version numbering, which retries on conflict up to 5 times).
- **Pagination**: controllers take `@Query() PaginationQuery` (`limit` 1–100, default 50; `offset`), repositories return `Page<T>`, controllers respond with `PageResponse.fromPage(page, mapFn)`.

### API contract

The HTTP API is specified in `../contracts/hephaestus.openapi.yaml` (spec-first). `pnpm generate:api` reads it from the `@aether-os/contracts` workspace package and writes `libs/core/src/api/generated/hephaestus-api.ts` (committed; never hand-edit). Every request/response DTO declares `implements ApiSchema<'SchemaName'>` from `@hephaestus/core`, so `tsc`/`pnpm build` fails when a DTO drifts from the spec. Note that `implements` doesn't catch extra fields in a DTO that the spec lacks, and the class-validator decorators (runtime validation) must be kept in line with the spec's constraints by hand. When adding or changing an endpoint: edit the spec, regenerate, then update the DTO/controller.

### ESM specifics

`"type": "module"` with `nodenext` resolution: relative imports must include the `.js` extension (`./agent.js`). `main.ts` uses top-level `await`.
