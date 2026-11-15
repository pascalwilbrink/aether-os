# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Krepis

`@aether-os/krepis` is the shared foundation for the Aether-os NestJS services (see `../CLAUDE.md`); a *krepis* is the stepped platform a Greek temple stands on. It holds what every service needs and nothing service-specific:

- `id/`: the `Brand` helper and platform-wide IDs (`OrganizationId`, `ProjectId`). Service-specific IDs stay in the service.
- `error/`: `DomainError(message, code)`, and `http/DomainErrorFilter`, which maps it to HTTP 409 `{ statusCode, error: code, message }`.
- `event/`: the `DomainEvent` shape (`eventId`, `aggregateId`, `aggregateVersion`, `eventType`, `occurredAt`, `payload`). Agreed, not built yet: it gains `schemaVersion`, `organizationId`, `projectId` and `actor`, and is also the message envelope on RabbitMQ (see `../docs/events.md`).
- `database/`: `TransactionManager` / `TypeOrmTransactionManager` (AsyncLocalStorage; nested calls join the outer transaction), `TransactionModule`, and `isUniqueViolation` (SQLite and Postgres). Target: `typeorm-transactional` replaces `TransactionManager` (see `../docs/engineering.md`).
- `pagination/` and `http/`: `Page`, `PageRequest`, `mapPage`, `PaginationQuery` (limit 1–100, default 50) and `PageResponse`.

The cross-cutting pieces planned in `../CLAUDE.md` belong here as they're built: the RabbitMQ outbox and idempotent consumers, OpenTelemetry setup (including trace context over RabbitMQ), Pistis token verification, and the OpenBao client.

Not here: each service's `DatabaseModule` (its own connection settings), its generated API types, and anything else specific to one service.

## Commands

```bash
pnpm install   # from the workspace root
pnpm build     # tsc -> dist/ (ESM + .d.ts); also runs on install via `prepare`
pnpm dev       # tsc --watch
pnpm lint
pnpm format
```

## How services consume it

Services depend on it as `"@aether-os/krepis": "workspace:*"` with `dependenciesMeta: { "@aether-os/krepis": { "injected": true } }`, and each service's `libs/core` re-exports it (`export * from '@aether-os/krepis'`), so libs keep importing from `@<service>/core`.

- **Injected, not symlinked:** pnpm copies the built package into the consumer and resolves its peer dependencies from the consumer. This matters: `@nestjs/common`, `typeorm`, `class-validator` and `class-transformer` are **peer dependencies** and must stay that way. (Target: class-validator and class-transformer are replaced by `zod` and `nestjs-zod`, which then become peer dependencies instead; see `../docs/engineering.md`.) A second copy would break Nest DI tokens (e.g. TypeORM's `DataSource`) and class-validator's metadata.
- **To pick up a change:** run `pnpm build` here (or `pnpm build` at the root). The root `pnpm-workspace.yaml` sets `syncInjectedDepsAfterScripts: [build]`, so the injected copies in every consumer are refreshed automatically; `pnpm dev` (tsc --watch) does not trigger this, so run `build` before testing a consumer.
- **Breaking changes:** consumers use whatever was last built, so update and test every consumer (currently Polis and Hephaestus) when changing an export.

TypeScript ESM with `nodenext` resolution: relative imports need the `.js` extension.
