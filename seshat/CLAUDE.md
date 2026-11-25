# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Seshat

Seshat is the Aether-os service for **project knowledge** (see `../CLAUDE.md` and `../docs/knowledge.md`); Seshat was the Egyptian goddess of writing and record-keeping. It keeps each project's **knowledge items**: documents, decisions, facts, conventions, architecture and lessons learned. People write them, agents propose them, approvers accept them, and they're versioned, superseded and retired, never overwritten. Documents are files in Loculus, or in repositories linked to the project (read through Proxenos and indexed again after every push), that Seshat indexes. Their passages are embedded through Pylon, the model gateway (`../docs/pylon.md`), and searched by keywords and by meaning together. Every change is published as an event.

Agents search, read and propose it with Hephaestus's knowledge tools (with their task token); people manage it on Iris's Knowledge page.

Planned:
- organization-wide items, other Office formats, OCR for scanned PDFs.

It follows `../docs/engineering.md` like Agora: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, `typeorm-transactional`, Postgres with migrations, and tests against Postgres (with pgvector) and RabbitMQ in containers.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres and RabbitMQ
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3009)
pnpm build
pnpm lint
pnpm format
pnpm generate:api              # libs/core/src/api/generated (Seshat's spec), clients/polis, clients/loculus, clients/pylon and clients/proxenos (generated clients), events/generated (Seshat's AsyncAPI, and Proxenos's for the events it consumes)

pnpm migration:run             # on dist/: build first
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts

pnpm test                      # unit tests (libs/**/*.spec.ts): transitions, text extraction and chunking, the Loculus, Pylon and Proxenos clients, rank fusion, configuration
pnpm test:e2e                  # test/*.e2e-spec.ts against Postgres (pgvector) and RabbitMQ; needs Docker
```

On a Postgres volume made before Seshat, create its database once from `../`: `docker compose exec postgres createdb -U aether seshat`.

## Configuration

Validated at startup (`libs/core/src/config/env.ts`, `seshatConfigModule()`); locally read from `.env`.

- `DATABASE_URL`, `RABBITMQ_URL`, `OUTBOX_RELAY_INTERVAL_MS` (1000), `PORT` (3009).
- `PISTIS_ISSUER` (plus `PISTIS_JWKS` in tests).
- `PISTIS_CLIENT_ID` (`seshat`) and `PISTIS_CLIENT_SECRET`: Seshat's own client at Pistis. It uses client credentials with `platform:read`, and `model:invoke` when `PYLON_URL` is set; outside production, Pistis registers `seshat` / `seshat-dev-secret` with both. Seshat uses it for its calls to Polis (`POLIS_URL`), Loculus (`LOCULUS_URL`), Pylon and Proxenos.
- **Embeddings:** `PYLON_URL` (optional: without it nothing is embedded and search is by keyword only), `EMBEDDING_MODEL` (`openai/text-embedding-3-small`: `<provider>/<model>`, an `embedding` model of Pylon's catalogue; changing it embeds everything again), `EMBEDDER_INTERVAL_MS` (2000; 0 turns the embedder off, as the tests do), `SEARCH_MIN_SIMILARITY` (0.3: the least cosine similarity of a match by meaning).
- **Postgres needs pgvector** (`CREATE EXTENSION vector`, in the `Embeddings` migration): `../docker-compose.yml` runs `pgvector/pgvector:0.8.0-pg17`.
- `INDEXER_INTERVAL_MS` (2000; 0 turns the indexer off, as the tests do) and `DOCUMENT_MAX_BYTES` (10 MiB).
- **Repository documents:** `PROXENOS_URL` (optional: without it repositories are recorded but not read), `REPOSITORY_SYNC_INTERVAL_MS` (5000; 0 turns the syncer off, as the tests do), `REPOSITORY_DEFAULT_PATHS` (`docs/,specs/,adr/,README.md`: what a newly linked repository indexes) and `REPOSITORY_MAX_DOCUMENTS` (500 per repository).

## Architecture

Same layout as Agora (`../agora/CLAUDE.md`): `src/` is the app shell, and code lives in libraries under `libs/`, aliased `@seshat/<name>`. Dependency graph: `core` ← `tenancy` ← `knowledge`. Every entity is listed in `src/database/entities.ts`.

- **`core`:** configuration, database, Krepis re-exported, Seshat's API types and Zod schemas (`../contracts/seshat.openapi.yaml`), the generated Polis, Loculus, Pylon and Proxenos clients, its events (`SeshatEvents`, `../contracts/seshat.asyncapi.yaml`) and Proxenos's types (`ProxenosEvents`).
- **`tenancy`:**
  - `TenancyService.assertProjectAcceptsWrites` asks Polis before every write. It answers 404 for an unknown organization or project, `ORGANIZATION_SUSPENDED`, `PROJECT_ARCHIVED`, or `503` when Polis can't be reached.
  - Reads only need the token (Krepis).
  - It also provides `ServiceTokens` (Seshat's own token), which the Loculus client uses too.
- **Messaging (`src/app.module.ts`):** Krepis's `EventsModule` publishes Seshat's events to `seshat.events` through the outbox, and consumes Proxenos's `git.repository-linked`, `git.repository-unlinked` and `git.pushed` (`seshat.proxenos-events`: inbox, retries, dead-lettering).
- **`knowledge`:**
  - **Items** (`KnowledgeItemsService`, `knowledge_items`; API under `/v1/organizations/{organizationId}/projects/{projectId}/knowledge`):
    - `POST /items` needs `knowledge:propose` (everyone with `knowledge:write`, and session tokens), `PUT /items/{id}` `knowledge:write`. A person's item (`subType` `user`) is `accepted` at once, with `source.kind: person`. A service account's (an agent's task token) is `proposed`, with `source.kind: task` and the token's `task_id`. A session token's (an agent in a person's session, e.g. a council's facilitator recording a decision; `../docs/councils.md`) is `proposed` too, with `source.kind: session` and the token's `session_id` and `agent_id` (`source_session_id`, `source_agent_id`).
    - **Decisions** (`decisions.ts`, pure, `decisions.spec.ts`): a `decision` may carry `rationale` and `alternatives` (`{ option, reason }`, at most 10), redacted like bodies, kept on each version and searchable after the body (`searchableText`); any other type with them is `KNOWLEDGE_ITEM_INVALID`. Migration `Decisions`.
    - Agents may change only proposals: changing an accepted item is a proposal that `supersedes` it (`KNOWLEDGE_ITEM_INVALID`).
    - `POST /items/{id}/accept`, `/reject` and `/retire` need `knowledge:approve`, which Krepis gives only to users. Transitions are in `knowledge-transitions.ts` (`KNOWLEDGE_ITEM_INVALID_TRANSITION`), and repeating the action that's already done returns the item.
    - Accepting an item that `supersedes` an accepted one marks the old one `superseded` (with `supersededBy`) in the same transaction. A person's superseding item does it at once.
    - `GET /items` (`?type=`, `?status=`, `?sessionId=`, newest first) and `GET /items/{id}` need `knowledge:read`. Another project's item is a 404. `GET /items/{id}` also takes a platform service's own token with `platform:read` (`@PlatformAccess`): Hephaestus pins items on new tasks with it.
    - `GET /items/{id}/passages` (`knowledge:read`, cursor-paged by `ordinal`): its current version's passages in order, a document's text; agents read documents with it (Hephaestus's `read_knowledge`).
  - **Versions** (`KnowledgeVersionsService`, `knowledge_item_versions`): every edit is a new `version`, and each version's content is kept (`GET /items/{id}/versions`, newest first).
  - **Redaction:** bodies are redacted with Krepis's `redactText(…, { keepEmails: true })` before they're stored.
  - **Documents** (`DocumentsService`):
    - `POST /documents` (`{ fileId, title?, tags? }`) checks through `DocumentFiles` that the file is an `available` file of the project in Loculus, no larger than `DOCUMENT_MAX_BYTES`; otherwise it fails with `KNOWLEDGE_DOCUMENT_INVALID`. It then creates a `document` item, with an empty body, that waits for indexing.
    - `PUT /documents/{id}` points the item at a new file: a new version, indexed again.
    - The file itself stays in Loculus. Seshat stores its ID, name, type, size and SHA-256, never a URL.
  - **Repository documents** (`KnowledgeRepositoriesService`, `knowledge_repositories`, one row per Proxenos repository link; `RepositorySyncer`; `../docs/knowledge.md`, Repository documents):
    - `proxenos.git.repository-linked` adds the link with `REPOSITORY_DEFAULT_PATHS`, `proxenos.git.repository-unlinked` retires its documents and removes it, `proxenos.git.pushed` marks each of the push's links pending unless it was read at that commit.
    - `GET …/knowledge/repositories` and `GET …/{linkId}` need `knowledge:read`; `PUT …/{linkId}` (`{ paths }`: folders end in `/`; adds a link that isn't indexed yet, e.g. one linked before), `POST …/{linkId}/sync` and `DELETE …/{linkId}` (retires its documents) need `knowledge:approve`. Another project's link is a 404.
    - Every request to read it bumps its `revision`; the syncer claims a pending one (`FOR UPDATE SKIP LOCKED`, five minutes), lists its files through `RepositoryFiles` (`HttpRepositoryFiles`, Proxenos's generated client with Seshat's own token: `GET …/repositories/{linkId}/files`; null for a 404, i.e. not the project's link), keeps those under its paths that `repositoryContentType` names (Markdown, text, CSV, HTML, PDF, `.docx`) and `DOCUMENT_MAX_BYTES` allows, up to `REPOSITORY_MAX_DOCUMENTS`, counts the rest as skipped, and `finish` has `KnowledgeItemsService.syncRepositoryDocuments` make the documents match in the same transaction: a new file is an accepted document (`source_kind` `repository`, created by `repository:<owner/name>`), another blob SHA a new version, a file gone a retired document. A sync whose `revision` is stale stays pending. A failure that may pass is retried after a minute, doubled, six tries; a 404 fails at once (`status: failed`, `error`) until asked again.
    - Each document records the link, `owner/name`, path, commit, blob SHA and GitHub URL (`repository_*` columns, and in each version's `document.repository`); one current document per link and path (a partial unique index; retired ones don't count). Changing, retiring, rejecting, superseding or `PUT …/documents/{id}` on one is `KNOWLEDGE_ITEM_READ_ONLY`.
    - The indexer reads a repository document's bytes through `RepositoryFiles.read` (`GET …/blobs/{sha}`, checked against Git's blob SHA, `gitBlobSha`), any other one from Loculus.
  - **Indexing** (`DocumentIndexer`, every `INDEXER_INTERVAL_MS`; `drain()` in tests):
    - `KnowledgeItemsService.claimDocument` takes the next `pending` document with `FOR UPDATE SKIP LOCKED` and holds it for five minutes.
    - `HttpDocumentFiles` reads the file with Seshat's own token (`platform:read` on Loculus's file and download routes) through a fresh signed URL, and checks its size and SHA-256. A refused token is renewed once.
    - `extractText` (`document-text.ts`, async) turns Markdown, plain text, CSV, JSON and HTML into text, PDFs too (`unpdf`, pages separated by a blank line; also by a `.pdf` name with a generic type) and Word `.docx` (`mammoth`, its raw text). Anything else is `unsupported`: listed, and searchable by title only. A PDF or Word file that can't be read, or has no text (a scanned PDF), is `unreadable`: the document `failed` with the reason, not retried. Fixtures for the tests are in `test/fixtures/`.
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
- `test/fake-repositories.ts`: repositories behind Proxenos, files at a new commit per `set`, recording listings and reads, with `failure`;
- `test/fake-embeddings.ts`: Pylon's embeddings, vectors from a few concepts ("car" near "automobile") and hashed words, recording every call, with `failure`; `createApp({ embeddings: null })` for none.

`test/global-setup.ts` starts Postgres with pgvector (`PGVECTOR_TEST_IMAGE`), applies the migrations and fails if the entities differ from them. `test/knowledge.e2e-spec.ts` covers items, documents (PDF and Word included) and their events; `test/embeddings.e2e-spec.ts` covers embedding, hybrid search, new versions, failures and search without Pylon; `test/repositories.e2e-spec.ts` covers repository documents (Proxenos's events through the inbox, the syncer, read-only items, paths, failures). `createApp` waits for the event consumer's queues before a test starts. Every test empties the tables (`test/database.ts`).

Clients come from the run's `TestTokens`: `asMember`, `asTask` (a task token) and `asService` (a platform service's own token). `test/outbox.ts` reads the events written to the outbox.

`http-document-files.spec.ts`, `http-embeddings.spec.ts` and `http-repository-files.spec.ts` run the Loculus, Pylon and Proxenos clients against a local HTTP server.
