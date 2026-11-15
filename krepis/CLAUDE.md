# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Krepis

`@aether-os/krepis` is the shared foundation for the Aether-os NestJS services (see `../CLAUDE.md`); a *krepis* is the stepped platform a Greek temple stands on. It holds what every service needs and nothing service-specific:

- `id/`: the `Brand` helper and platform-wide IDs (`OrganizationId`, `ProjectId`). Service-specific IDs stay in the service.
- `error/`: `DomainError(message, code)`; services extend it for business-rule violations (→ 409).
- `event/`: the messaging module, outbound side (`../docs/events.md`, `../docs/engineering.md` Events in code):
  - `DomainEvent`, the envelope (`eventId` UUIDv7, `eventType`, `schemaVersion`, `aggregateId`, `aggregateVersion`, `occurredAt`, `organizationId`, `projectId`, `actor`, `payload`), which is also the published message.
  - `EventsModule.forRoot({ service, publish, relay? })` (global): `DomainEvents.emit(event)` must run inside a transaction (`Propagation.MANDATORY`); event types in `publish` are written to the `outbox` table in that transaction, then the event is emitted locally as `<service>.<eventType>` and awaited (`@OnEvent`, re-exported). Each service creates the `outbox` table with its own migration (`OutboxMessageEntity` in its data source).
  - `OutboxRelay` (with `relay: { useFactory → { url, intervalMs, batchSize, retentionMs } }`): publishes waiting rows in batches to the `<service>.events` topic exchange (routing key = event type, `messageId` = event ID, persistent), using `FOR UPDATE SKIP LOCKED` so instances share the work; marks a row published only after the broker's confirm, records failures (`attempts`, `lastError`) and retries them; deletes published rows after the retention period. `relayBatch()` runs one batch (tests). The broker is behind `MessagePublisher`; `RabbitMqMessagePublisher` uses `@golevelup/nestjs-rabbitmq` and starts even while RabbitMQ is down (events wait in the outbox).
  - Trace context: `emit` stores `currentTraceContext()` (`traceparent`, `tracestate`) in the row's `headers`, and the relay publishes them as AMQP headers, so a consumer continues the trace.
  - Not yet: consuming (queues, inbox deduplication, retries, dead-lettering, restoring the trace context from headers).
- `database/`:
  - `initializeTransactions()` (call in `main.ts` before Nest boots, and in test setup) and `createTransactionalDataSource(options)` (for `TypeOrmModule.forRootAsync({ dataSourceFactory })`; replaces an earlier registration of the same name, as e2e tests create many apps): `typeorm-transactional`, with `Transactional`, `Propagation` and the commit/rollback hooks re-exported.
  - `postgresOptions({ url, migrations?, entities? })`: every service's Postgres settings (`SnakeNamingStrategy`, `synchronize` and `migrationsRun` off).
  - `isUniqueViolation` (Postgres `23505`).
- `telemetry/`: `currentTraceContext()` returns the W3C trace context to pass on: the current OpenTelemetry span when an SDK is running (through `@opentelemetry/api`, a peer dependency), otherwise the `traceparent` / `tracestate` the current request arrived with, which `configureHttpApp` keeps for the request (`runWithTraceContext`). `ProblemDetailsFilter` takes its `traceId` from the same place. Services don't start an OpenTelemetry SDK yet; when they do, nothing here changes.
- `config/`: `validateEnv(zodSchema)`, the `validate` function for `ConfigModule.forRoot`; it names invalid variables without echoing their values.
- `testing/` (separate entry point `@aether-os/krepis/testing`, needs `@testcontainers/postgresql` and `@testcontainers/rabbitmq`): `startTestPostgres()` and `startTestRabbitMq()`, Postgres 17.5 and RabbitMQ 4.1 (the compose versions) in containers for a test run's global setup.
- `pagination/`: cursor pagination (`../docs/api.md`): `PageRequest` (`limit`, `cursor`), `Page` (`items`, `nextCursor`), `mapPage`, and opaque cursors (`encodeCursor` / `decodeCursor`: base64url JSON with the last item's sort key and ID, bound to a hash of the query's sort and filters; `InvalidCursorError` otherwise).
- `database/findPage`: keyset pagination over a TypeORM `Repository` (`(sortBy, id) < (key, id)`, tie-broken by ID in the same direction, `limit + 1` rows to detect a next page).
- `http/`: `configureHttpApp(app)` (the `/v1` prefix, except `health`; `ZodValidationPipe`; the response serializer; `ProblemDetailsFilter`; the request's trace context), which every service calls in `main.ts` and in its e2e tests. `ProblemDetailsFilter` turns `DomainError` (409), `ValidationProblemException` (400 `VALIDATION_FAILED` with `errors`), `InvalidCursorError` (400), Nest `HttpException`s and unknown errors (500, logged, no internals) into RFC 9457 problem details with `code`, `traceId` (from `traceparent`) and `errors`. `ZodValidationPipe` validates parameters typed as `createZodDto` classes: it rejects unknown fields (by comparing the input with Zod's stripped output, since the generated schemas aren't strict), coerces numeric and boolean query and path strings, and reports a JSON Pointer per body field or the parameter name. `configureHttpApp` also installs nestjs-zod's `ZodSerializerInterceptor`, so handlers with `@ZodSerializerDto(X)` return only what the spec allows (a response that breaks its schema is a 500). `createZodDto` and `ZodSerializerDto` are re-exported.

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
pnpm test:e2e  # src/**/*.int-spec.ts against Postgres and RabbitMQ in containers (findPage, outbox); needs Docker
```

## How services consume it

Services depend on it as `"@aether-os/krepis": "workspace:*"` with `dependenciesMeta: { "@aether-os/krepis": { "injected": true } }`, and each service's `libs/core` re-exports it (`export * from '@aether-os/krepis'`), so libs keep importing from `@<service>/core`.

- **Injected, not symlinked:** pnpm copies the built package into the consumer and resolves its peer dependencies from the consumer (`dedupeInjectedDeps: false` in `../pnpm-workspace.yaml` keeps it from symlinking instead). This matters: `@nestjs/common`, `@nestjs/core`, `typeorm`, `typeorm-transactional`, `zod`, `nestjs-zod`, `@nestjs/typeorm`, `@nestjs/event-emitter`, `@golevelup/nestjs-rabbitmq` and `@opentelemetry/api` are **peer dependencies** and must stay that way, so every consumer installs them. A second copy would break Nest DI tokens (e.g. TypeORM's `DataSource`) and the transaction and trace contexts.
- **Version caveats:** `nestjs-zod` 5 declares Nest ≤ 11 and `typeorm-transactional` 0.5 predates TypeORM 1.x; both are tested here with Nest 12 and TypeORM 1.1 (`src/http/http-app.spec.ts`, the Polis and Hephaestus integration tests). Re-run those when upgrading.
- **To pick up a change:** run `pnpm build` here (or `pnpm build` at the root). The root `pnpm-workspace.yaml` sets `syncInjectedDepsAfterScripts: [build]`, so the injected copies in every consumer are refreshed automatically; `pnpm dev` (tsc --watch) does not trigger this, so run `build` before testing a consumer.
- **Breaking changes:** consumers use whatever was last built, so update and test every consumer (currently Polis and Hephaestus) when changing an export.

TypeScript ESM with `nodenext` resolution: relative imports need the `.js` extension.
