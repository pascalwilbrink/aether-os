# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Krepis

`@aether-os/krepis` is the shared foundation for the Aether-os NestJS services (see `../CLAUDE.md`); a *krepis* is the stepped platform a Greek temple stands on. It holds what every service needs and nothing service-specific:

- `id/`: the `Brand` helper and platform-wide IDs (`OrganizationId`, `ProjectId`). Service-specific IDs stay in the service.
- `error/`: `DomainError(message, code)`; services extend it for business-rule violations (→ 409).
- `event/`: the `DomainEvent` shape (`eventId`, `aggregateId`, `aggregateVersion`, `eventType`, `occurredAt`, `payload`). Agreed, not built yet: it gains `schemaVersion`, `organizationId`, `projectId` and `actor`, and is also the message envelope on RabbitMQ (see `../docs/events.md`).
- `database/`:
  - `initializeTransactions()` (call in `main.ts` before Nest boots, and in test setup) and `createTransactionalDataSource(options)` (for `TypeOrmModule.forRootAsync({ dataSourceFactory })`; replaces an earlier registration of the same name, as e2e tests create many apps): `typeorm-transactional`, with `Transactional`, `Propagation` and the commit/rollback hooks re-exported.
  - `postgresOptions({ url, migrations?, entities? })`: every service's Postgres settings (`SnakeNamingStrategy`, `synchronize` and `migrationsRun` off).
  - `isUniqueViolation` (SQLite and Postgres).
  - Legacy, for Hephaestus until it's converted: `TransactionManager` / `TypeOrmTransactionManager` and `TransactionModule`.
- `config/`: `validateEnv(zodSchema)`, the `validate` function for `ConfigModule.forRoot`; it names invalid variables without echoing their values.
- `testing/` (separate entry point `@aether-os/krepis/testing`, needs `@testcontainers/postgresql`): `startTestPostgres()`, Postgres 17.5 in a container for a test run's global setup.
- `pagination/`: cursor pagination (`../docs/api.md`): `PageRequest` (`limit`, `cursor`), `Page` (`items`, `nextCursor`), `mapPage`, and opaque cursors (`encodeCursor` / `decodeCursor`: base64url JSON with the last item's sort key and ID, bound to a hash of the query's sort and filters; `InvalidCursorError` otherwise).
- `database/findPage`: keyset pagination over a TypeORM `Repository` (`(sortBy, id) < (key, id)`, tie-broken by ID in the same direction, `limit + 1` rows to detect a next page).
- `http/`: `configureHttpApp(app)` (the `/v1` prefix, except `health`; `ProblemValidationPipe`; `ProblemDetailsFilter`), which every service calls in `main.ts` and in its e2e tests. `ProblemDetailsFilter` turns `DomainError` (409), `ValidationProblemException` (400 `VALIDATION_FAILED` with `errors`), `InvalidCursorError` (400), Nest `HttpException`s and unknown errors (500, logged, no internals) into RFC 9457 problem details with `code`, `traceId` (from `traceparent`) and `errors`. `ZodValidationPipe` validates parameters typed as `createZodDto` classes: it rejects unknown fields (by comparing the input with Zod's stripped output, since the generated schemas aren't strict), coerces numeric and boolean query and path strings, and reports a JSON Pointer per body field or the parameter name. `ProblemValidationPipe` does the same for class-validator DTOs (Hephaestus) and skips Zod DTOs. `configureHttpApp` also installs nestjs-zod's `ZodSerializerInterceptor`, so handlers with `@ZodSerializerDto(X)` return only what the spec allows (a response that breaks its schema is a 500). `createZodDto` and `ZodSerializerDto` are re-exported. Also `PaginationQuery` and `PageResponse` (class-validator, for Hephaestus).

The cross-cutting pieces planned in `../CLAUDE.md` belong here as they're built: the RabbitMQ outbox and idempotent consumers, OpenTelemetry setup (including trace context over RabbitMQ), Pistis token verification, and the OpenBao client.

Not here: each service's `DatabaseModule` (its own connection settings), its generated API types, and anything else specific to one service.

## Commands

```bash
pnpm install   # from the workspace root
pnpm build     # tsc -> dist/ (ESM + .d.ts); also runs on install via `prepare`
pnpm dev       # tsc --watch
pnpm lint
pnpm format
pnpm test      # vitest: src/**/*.spec.ts (the HTTP conventions run against a real Nest app)
pnpm test:e2e  # src/**/*.int-spec.ts against Postgres in a container (findPage); needs Docker
```

## How services consume it

Services depend on it as `"@aether-os/krepis": "workspace:*"` with `dependenciesMeta: { "@aether-os/krepis": { "injected": true } }`, and each service's `libs/core` re-exports it (`export * from '@aether-os/krepis'`), so libs keep importing from `@<service>/core`.

- **Injected, not symlinked:** pnpm copies the built package into the consumer and resolves its peer dependencies from the consumer (`dedupeInjectedDeps: false` in `../pnpm-workspace.yaml` keeps it from symlinking instead). This matters: `@nestjs/common`, `@nestjs/core`, `typeorm`, `typeorm-transactional`, `zod`, `nestjs-zod`, `class-validator` and `class-transformer` are **peer dependencies** and must stay that way, so every consumer installs them. A second copy would break Nest DI tokens (e.g. TypeORM's `DataSource`), class-validator's metadata and the transaction context. class-validator and class-transformer go once Hephaestus is on Zod.
- **Version caveats:** `nestjs-zod` 5 declares Nest ≤ 11 and `typeorm-transactional` 0.5 predates TypeORM 1.x; both are tested here with Nest 12 and TypeORM 1.1 (`src/http/http-app.spec.ts`, Polis's integration tests). Re-run those when upgrading.
- **To pick up a change:** run `pnpm build` here (or `pnpm build` at the root). The root `pnpm-workspace.yaml` sets `syncInjectedDepsAfterScripts: [build]`, so the injected copies in every consumer are refreshed automatically; `pnpm dev` (tsc --watch) does not trigger this, so run `build` before testing a consumer.
- **Breaking changes:** consumers use whatever was last built, so update and test every consumer (currently Polis and Hephaestus) when changing an export.

TypeScript ESM with `nodenext` resolution: relative imports need the `.js` extension.
