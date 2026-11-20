# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Loculus

Loculus is the Aether-os service for **files** (see `../CLAUDE.md` and `../docs/files.md`); a *loculus* (Latin) is a small compartment or niche. It keeps each project's files in S3-compatible storage (RustFS locally, AWS S3 or another in production) and issues **signed URLs** to upload and download them: the bytes go straight between the client and the storage, never through Loculus. Planned: file artifacts in Hephaestus, uploads and previews in Iris, refusing uploads in suspended organizations and archived projects (Polis's events), sweeping uploads that were never completed, retention, events, multipart uploads.

It follows `../docs/engineering.md` like Kerykes: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, Postgres with migrations, tests against Postgres and RustFS in containers. It has no RabbitMQ yet (it publishes and consumes nothing), but keeps Krepis's peer dependencies installed.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres and RustFS
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3007)
pnpm build
pnpm lint
pnpm format
pnpm generate:api              # libs/core/src/api/generated from ../contracts/loculus.openapi.yaml

pnpm migration:run             # on dist/: build first
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts

pnpm test                      # unit tests (libs/**/*.spec.ts): configuration, Content-Disposition
pnpm test:e2e                  # test/*.e2e-spec.ts against Postgres and RustFS; needs Docker
```

## Configuration

Validated at startup (`libs/core/src/config/env.ts`, `loculusConfigModule()`); locally from `.env`: `DATABASE_URL`, `PORT` (3007), `PISTIS_ISSUER` (and `PISTIS_JWKS` in tests). Storage: `S3_ENDPOINT` (the S3 API Loculus calls; left out for AWS), `S3_PUBLIC_ENDPOINT` (the S3 API clients reach with signed URLs, since a signature covers the host; `S3_ENDPOINT` by default), `S3_REGION` (`us-east-1`), `S3_BUCKET` (`loculus`), `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` (both or neither; neither uses the SDK's default credentials, e.g. an IAM role), `S3_FORCE_PATH_STYLE` (false; true for RustFS and MinIO), `S3_CREATE_BUCKET` (false; true locally: the bucket is made at startup if it's missing). Limits: `FILE_MAX_BYTES` (100 MiB), `UPLOAD_URL_TTL_SECONDS` (900), `DOWNLOAD_URL_TTL_SECONDS` (300).

## Architecture

`src/` is the app shell, code lives in libraries under `libs/`, aliased `@loculus/<name>`. Dependency graph: `core` ← `files`. Every entity is listed in `src/database/entities.ts`.

- **`core`:** configuration, database, Krepis re-exported, Loculus's API types and Zod schemas (`../contracts/loculus.openapi.yaml`).
- **`files`:**
  - `FilesController` (`/v1/organizations/{organizationId}/projects/{projectId}/files`; Krepis checks the token's organization and the permission in the project: `file:write` to create, renew an upload, complete and delete, `file:read` to list, read and download; a task token only reaches its own project).
  - `FilesService`: `create` (over `FILE_MAX_BYTES` is `FILE_TOO_LARGE`; the row `pending` with a new UUIDv7 and the object key `orgs/{organizationId}/projects/{projectId}/files/{id}`, never the file's name, and a signed upload), `upload` (a fresh one while pending, else `FILE_NOT_PENDING`), `complete` (`ObjectStorage.inspect`: nothing there, another size or another SHA-256 is `FILE_UPLOAD_INCOMPLETE` and it stays pending; else `available` with `completedAt`; idempotent), `download` (available only, else `FILE_NOT_AVAILABLE`), `delete` (the object, then the row; idempotent), `list` (newest first, `?status=`, `findPage`). Everything is looked up within the route's organization and project, so another project's file is a 404. The storage not answering is a 503.
  - `ObjectStorage` (abstract) → `S3ObjectStorage` (AWS SDK v3; one client for Loculus's own calls, one for signing with the public endpoint; the SDK's automatic checksums off, since S3-compatible stores don't all take them): `signUpload` signs a `PUT` with `content-type`, `content-length` and `x-amz-checksum-sha256` (kept as a header, `unhoistableHeaders`), so the store refuses any other bytes; `signDownload` signs a `GET` with `response-content-disposition` from `attachment(fileName)` (`content-disposition.ts`, unit-tested: an ASCII `filename` and the exact `filename*`), so a file is never shown inline from the storage's origin; `inspect` (`HeadObject` with the stored SHA-256, or the bytes hashed when the store keeps none); `delete`; `ensureBucket`. 404s are "not there"; anything else is `StorageUnavailableError`.
  - `file.entity.ts`: `files` (`size_bytes` a `bigint` read as a number, `status` checked, indexes for both list orders).

## Tests

`test/global-setup.ts` starts Postgres and RustFS (`test/storage.ts`: `rustfs/rustfs:1.0.5`, the compose version, with the test bucket), applies the migrations and fails if the entities differ from them; `test/app.ts` builds the app with tokens from the run's `TestTokens` (`asMember`, `asTask`: a service account's task token for one project). `test/files.e2e-spec.ts` uploads real bytes through the signed URLs (and tampered ones, which the store refuses), completes, downloads and deletes, checks permissions and projects, and a store that doesn't answer.
