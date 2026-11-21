# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Seshat

Seshat is the Aether-os service for **project knowledge** (see `../CLAUDE.md` and `../docs/knowledge.md`); Seshat was the Egyptian goddess of writing and record-keeping. It keeps each project's **knowledge items**: documents, decisions, facts, conventions, architecture and lessons learned. People write them, agents propose them, approvers accept them, and they're versioned, superseded and retired, never overwritten. Documents are files in Loculus that Seshat indexes. Their passages are embedded through Pylon, the model gateway (`../docs/pylon.md`), and searched by keywords and by meaning together. Every change is published as an event.

Planned:
- the agents' knowledge tools in Hephaestus, and Iris's Knowledge page;
- organization-wide items, repository documents, PDF and Office text.

It follows `../docs/engineering.md` like Agora: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, `typeorm-transactional`, Postgres with migrations, and tests against Postgres (with pgvector) and RabbitMQ in containers.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres and RabbitMQ
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3009)
pnpm build
pnpm lint
pnpm format
pnpm generate:api              # libs/core/src/api/generated (Seshat's spec), clients/polis, clients/loculus and clients/pylon (generated clients), events/generated (Seshat's AsyncAPI)

pnpm migration:run             # on dist/: build first
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts

pnpm test                      # unit tests (libs/**/*.spec.ts): transitions, text extraction and chunking, the Loculus and Pylon clients, rank fusion, configuration
pnpm test:e2e                  # test/*.e2e-spec.ts against Postgres (pgvector) and RabbitMQ; needs Docker
```

On a Postgres volume made before Seshat, create its database once from `../`: `docker compose exec postgres createdb -U aether seshat`.

## Configuration

Validated at startup (`libs/core/src/config/env.ts`, `seshatConfigModule()`); locally read from `.env`.

- `DATABASE_URL`, `RABBITMQ_URL`, `OUTBOX_RELAY_INTERVAL_MS` (1000), `PORT` (3009).
- `PISTIS_ISSUER` (plus `PISTIS_JWKS` in tests).
- `PISTIS_CLIENT_ID` (`seshat`) and `PISTIS_CLIENT_SECRET`: Seshat's own client at Pistis. It uses client credentials with `platform:read`, and `model:invoke` when `PYLON_URL` is set; outside production, Pistis registers `seshat` / `seshat-dev-secret` with both. Seshat uses it for its calls to Polis (`POLIS_URL`), Loculus (`LOCULUS_URL`) and Pylon.
- **Embeddings:** `PYLON_URL` (optional: without it nothing is embedded and search is by keyword only), `EMBEDDING_MODEL` (`openai/text-embedding-3-small`: `<provider>/<model>`, an `embedding` model of Pylon's catalogue; changing it embeds everything again), `EMBEDDER_INTERVAL_MS` (2000; 0 turns the embedder off, as the tests do), `SEARCH_MIN_SIMILARITY` (0.3: the least cosine similarity of a match by meaning).
- **Postgres needs pgvector** (`CREATE EXTENSION vector`, in the `Embeddings` migration): `../docker-compose.yml` runs `pgvector/pgvector:0.8.0-pg17`.
- `INDEXER_INTERVAL_MS` (2000; 0 turns the indexer off, as the tests do) and `DOCUMENT_MAX_BYTES` (10 MiB).

## Architecture

Same layout as Agora (`../agora/CLAUDE.md`): `src/` is the app shell, and code lives in libraries under `libs/`, aliased `@seshat/<name>`. Dependency graph: `core` ← `tenancy` ← `knowledge`. Every entity is listed in `src/database/entities.ts`.

- **`core`:** configuration, database, Krepis re-exported, Seshat's API types and Zod schemas (`../contracts/seshat.openapi.yaml`), the generated Polis, Loculus and Pylon clients, and its events (`SeshatEvents`, `../contracts/seshat.asyncapi.yaml`).
- **`tenancy`:**
  - `TenancyService.assertProjectAcceptsWrites` asks Polis before every write. It answers 404 for an unknown organization or project, `ORGANIZATION_SUSPENDED`, `PROJECT_ARCHIVED`, or `503` when Polis can't be reached.
  - Reads only need the token (Krepis).
  - It also provides `ServiceTokens` (Seshat's own token), which the Loculus client uses too.
- **Messaging (`src/app.module.ts`):** Krepis's `EventsModule` publishes Seshat's events to `seshat.events` through the outbox. Seshat consumes nothing yet.
- **`knowledge`:**
  - **Items** (`KnowledgeItemsService`, `knowledge_items`; API under `/v1/organizations/{organizationId}/projects/{projectId}/knowledge`):
    - `POST /items` and `PUT /items/{id}` need `knowledge:write`. A person's item (`subType` `user`) is `accepted` at once, with `source.kind: person`. A service account's (an agent's task token) is `proposed`, with `source.kind: task` and the token's `task_id`.
    - Agents may change only proposals: changing an accepted item is a proposal that `supersedes` it (`KNOWLEDGE_ITEM_INVALID`).
    - `POST /items/{id}/accept`, `/reject` and `/retire` need `knowledge:approve`, which Krepis gives only to users. Transitions are in `knowledge-transitions.ts` (`KNOWLEDGE_ITEM_INVALID_TRANSITION`), and repeating the action that's already done returns the item.
    - Accepting an item that `supersedes` an accepted one marks the old one `superseded` (with `supersededBy`) in the same transaction. A person's superseding item does it at once.
    - `GET /items` (`?type=`, `?status=`, newest first) and `GET /items/{id}` need `knowledge:read`. Another project's item is a 404.
  - **Versions** (`KnowledgeVersionsService`, `knowledge_item_versions`): every edit is a new `version`, and each version's content is kept (`GET /items/{id}/versions`, newest first).
  - **Redaction:** bodies are redacted with Krepis's `redactText(…, { keepEmails: true })` before they're stored.
  - **Documents** (`DocumentsService`):
    - `POST /documents` (`{ fileId, title?, tags? }`) checks through `DocumentFiles` that the file is an `available` file of the project in Loculus, no larger than `DOCUMENT_MAX_BYTES`; otherwise it fails with `KNOWLEDGE_DOCUMENT_INVALID`. It then creates a `document` item, with an empty body, that waits for indexing.
    - `PUT /documents/{id}` points the item at a new file: a new version, indexed again.
    - The file itself stays in Loculus. Seshat stores its ID, name, type, size and SHA-256, never a URL.
  - **Indexing** (`DocumentIndexer`, every `INDEXER_INTERVAL_MS`; `drain()` in tests):
    - `KnowledgeItemsService.claimDocument` takes the next `pending` document with `FOR UPDATE SKIP LOCKED` and holds it for five minutes.
    - `HttpDocumentFiles` reads the file with Seshat's own token (`platform:read` on Loculus's file and download routes) through a fresh signed URL, and checks its size and SHA-256. A refused token is renewed once.
    - `extractText` (`document-text.ts`) turns Markdown, plain text, CSV, JSON and HTML into text. Anything else is `unsupported`: listed, and searchable by title only.
    - `finishIndexing` replaces the item's passages. When Loculus or the storage doesn't answer, it retries after a minute, doubled each try, five tries in all. A missing or mismatched file fails at once. The outcome is on the item (`document.indexing`).
    - A version replaced while it was being indexed is left alone.
  - **Passages** (`KnowledgeChunksService`, `knowledge_chunks`):
    - Each item's current version is split by `chunkText` (paragraphs up to about 1500 characters; a heading starts a new passage), and the item's title leads the first passage. A document named after its file gets words in place of its file name (`searchableTitle`).
    - `tsv` is a generated `tsvector` (English) with a GIN index that the migration creates. TypeORM can't declare the index; it records the generated column in `typeorm_metadata` under the database's name.
    - Written items are passaged when saved; documents when indexed.
  - **Embeddings** (`KnowledgeEmbedder`, every `EMBEDDER_INTERVAL_MS`; `drain()` in tests; `../docs/knowledge.md`, Search):
    - Whenever an item's passages are replaced, its `embedding_status` becomes `pending` (and its vectors go with the old passages, `knowledge_embeddings`).
    - `KnowledgeItemsService.claimForEmbedding` takes the next pending accepted or proposed item (`FOR UPDATE SKIP LOCKED`, held five minutes); the embedder sends its passages (`KnowledgeChunksService.passagesOf`) to Pylon in batches of 64 (`Embeddings` → `HttpEmbeddings`: `POST …/projects/{projectId}/embeddings`, purpose `knowledge`, Seshat's own token, a refused token renewed once), and `finishEmbedding` stores one vector per passage (`storeEmbeddings`; pgvector, any length, with its model and `dimensions`) and marks it `embedded`.
    - A failure keeps it `pending` with `embedding_error`, tried again after a minute, doubled per try, at most six hours; six hours at once when only configuration helps (Pylon's 400, 403, 404, 409: no key, an unknown model). A budget that ran out (402), 5xx and no answer are retried. A version replaced meanwhile is left alone.
    - At startup, items embedded with another model than `EMBEDDING_MODEL` wait to be embedded again (`requeueEmbeddingsNotFrom`). Without `PYLON_URL`, `NoEmbeddings`: nothing is embedded.
  - **Search** (`KnowledgeSearchService`, `POST /search`, `knowledge:read`), hybrid:
    - **Keywords:** `websearch_to_tsquery` over the passages of current versions, ranked by `ts_rank_cd`, the best passage of each item.
    - **Meaning:** the query embedded through Pylon (5 s at most), then `searchByVector`: the nearest passage of each item (pgvector's cosine distance `<=>`, vectors of the same model and length, exact, no ANN index yet) at least `SEARCH_MIN_SIMILARITY` alike.
    - **Together:** reciprocal rank fusion (`fuse`, k = 60) over 50 candidates each way; each result has `matchedBy` and the passage of the list it ranked higher in (keywords on a tie). `semantic: false` when the query couldn't be embedded (or no Pylon): keywords only.
    - Only `accepted` items are searched, plus `proposed` ones with `includeProposed`; it also takes `types` and `limit`.
  - **Events** (in the change's transaction; `aggregateVersion` is the item's `revision`, one more per event):
    - `knowledge-item.proposed`, `.accepted`, `.rejected`, `.updated`, `.superseded` and `.retired` carry the item's type, status, version, source kind and `supersededBy`.
    - `knowledge-item.indexed` (version, `chunkCount`) is published whenever its passages change; the embedder embeds them right after, through Pylon.
- **Errors:** `DomainError`s are 409 with their `code`.

## Tests

`test/app.ts` builds the whole app (`createApp`) on the run's Postgres and RabbitMQ, with fakes in place of the HTTP clients:
- `test/fake-polis.ts`: organizations and projects as Polis would return them;
- `test/fake-files.ts`: Loculus's files, with `failure` to make reading fail;
- `test/fake-embeddings.ts`: Pylon's embeddings, vectors from a few concepts ("car" near "automobile") and hashed words, recording every call, with `failure`; `createApp({ embeddings: null })` for none.

`test/global-setup.ts` starts Postgres with pgvector (`PGVECTOR_TEST_IMAGE`), applies the migrations and fails if the entities differ from them. `test/embeddings.e2e-spec.ts` covers embedding, hybrid search, new versions, failures and search without Pylon. Every test empties the tables (`test/database.ts`).

Clients come from the run's `TestTokens`: `asMember` and `asTask` (a task token). `test/outbox.ts` reads the events written to the outbox.

`http-document-files.spec.ts` and `http-embeddings.spec.ts` run the Loculus and Pylon clients against a local HTTP server.
