# Project knowledge

What agents know about the project they work in: its documents, the decisions taken, facts, conventions, its architecture and the lessons learned. Seshat holds it; every authorized agent can search it, and tasks can pin parts of it into their context. See `learning.md` for how this differs from skills.

Status: phase 1 of `learning.md`, in three steps.

1. **Built:** Seshat as a service in this repository (`../seshat/`, port 3009): knowledge items per project with their lifecycle and versions, documents indexed from Loculus, keyword search, `knowledge:*` permissions, events (`../contracts/seshat.openapi.yaml`, `../contracts/seshat.asyncapi.yaml`).
2. **Next:** embeddings through Hephaestus's model gateway, stored in Seshat (pgvector), and hybrid search.
3. **Then:** the agents' knowledge tools in Hephaestus and Iris's Knowledge page.

Later: organization-wide items, repository documents, pinned context on tasks, proposals from meetings, PDF and Office documents.

## Decisions

| Decision | Choice |
|---|---|
| Owner | **Seshat, a service in this repository** (`../seshat/`) like the others: Krepis, Postgres, the outbox, Pistis tokens. Aether-os services never keep their own copies. |
| Scope | **Per project**, plus **organization-wide** items (conventions every project shares). Never across organizations. |
| Unit | **Typed knowledge items** (`document`, `decision`, `fact`, `convention`, `architecture`, `lesson`), not free text in one memory. |
| Document content | **Lives once, in Loculus** (or in the project's repository); Seshat indexes it and keeps a reference, as `tasks.md` already decides for documents. |
| Who writes | **People write directly; agents and meetings propose.** A proposal becomes knowledge only when someone with `knowledge:approve` accepts it. |
| History | **Items are superseded, not overwritten.** A changed decision is a new item that supersedes the old one; the old one stays readable with its status. |
| Retrieval | **Two ways:** pinned into a task's `context` when the task is created (reproducible), and searched by the agent while it runs (built-in tools in Hephaestus that call Seshat with the task token). |
| Embeddings | **Through Hephaestus's model gateway** (`models.md`): metered and priced like every model call, with the organization's provider keys, against its budgets. Seshat never holds a provider key. |
| Calls between Seshat and Hephaestus | **Never both ways synchronously** (`engineering.md`). Seshat calls only Polis and Loculus. Hephaestus embeds what Seshat indexed by reacting to `knowledge-item.indexed` (it reads the passages and writes their vectors back), and whoever searches sends the query's embedding along: Hephaestus for agents, and for Iris through Hephaestus's embeddings endpoint. Without vectors, search is by keyword only. |
| Access | **The caller's token decides**: Aether-os tokens (users', service accounts', task tokens), verified like every service does, with new `knowledge:*` permissions. |

## Knowledge items

| Type | What it holds | Example |
|---|---|---|
| `document` | A file, indexed for search: specs, designs, manuals, uploaded references | `architecture-overview.pdf`, `specs/billing.md` in the repository |
| `decision` | A choice and why it was made (an ADR): context, decision, consequences | "Use RabbitMQ topic exchanges, one per service" |
| `fact` | Something true about the project, short and checkable | "Production runs in eu-west-1", "the API is versioned under `/v1`" |
| `convention` | How things are done here | "Branches are `feature/<ticket>`", "money is stored in micro-dollars" |
| `architecture` | How the system is put together: components, boundaries, data flows | "Kairos sends `task.create` to Hephaestus over RabbitMQ" |
| `lesson` | What went wrong or right and what to do next time | "Deploys fail when migrations take locks: split them" |

Common fields: `id`, `organizationId`, `projectId` (organization-wide items, with no project, come later), `type`, `title`, `body` (Markdown; for a `document`, a summary), `status`, `version` (grows with each edit), `tags`, `source` (below), `references` (documents, artifacts, commits, meetings, other items), `supersedes` / `supersededBy`, `reviewBy` (optional date after which Iris flags it as possibly stale), `createdBy`, `acceptedBy`, timestamps. A `document` item adds the document reference (`tasks.md`, Documents: Loculus `fileId` and `sha256`, later a repository path at a commit) and its indexing state. Its `body` stays empty: its text is in its passages, and Loculus keeps the file.

`source` records where an item came from, so every answer can be traced back:

| `source.kind` | Means |
|---|---|
| `person` | Written in Iris or through the API (built) |
| `task` | Proposed by an agent during a task: the task token's `task_id` (built) |
| `document` | Extracted from or summarizing a document (which one, which version) |
| `meeting` | Proposed from a meeting's transcript (meeting, and where in it) |
| `repository` | Indexed from the project's repository (path, commit) |

### Lifecycle

```
proposed ──(accepted)──▶ accepted ──(a newer item supersedes it)──▶ superseded
    │                       │
    └──(rejected)──▶ rejected └──(no longer true, nothing replaces it)──▶ retired
```

- **People with `knowledge:write` create items as `accepted`.** Agents (task tokens, any service account) and meetings can only create `proposed` items, and may change only their proposals (an accepted item is changed by proposing one that supersedes it); someone with `knowledge:approve` accepts, edits then accepts, or rejects them, in Iris's knowledge inbox. Kerykes tells the project's approvers when proposals wait (`knowledge-item.proposed`).
- **Editing** an item creates a new `version` (`GET …/items/{id}/versions` keeps every one); a change of substance (a decision reversed) should be a new item that supersedes it, so tasks that relied on the old one can still see what they used.
- **Superseding:** an item names the accepted item it replaces (`supersedes`); when it's accepted (at once for a person's), the old one becomes `superseded` with `supersededBy`, in the same transaction.
- **Only `accepted` items are retrieved by default.** Search can include `proposed` items when asked, marked as unconfirmed; `superseded`, `retired` and `rejected` never come back unless asked for by ID.
- Proposal: a project setting lets some proposals be accepted automatically (e.g. `document` items from uploads), never `decision`s.

## Ingestion

- **Uploaded documents (built):** uploaded to Loculus as usual (`files.md`), then registered with Seshat as a `document` item (`POST …/knowledge/documents` with the `fileId` of an `available` file of the project, at most `DOCUMENT_MAX_BYTES`). Seshat's indexer (a poller; instances share the work with `FOR UPDATE SKIP LOCKED`) reads the file with its own token (`platform:read` on Loculus's file and download routes) through a fresh signed URL (never stored), checks its SHA-256, extracts text (Markdown, plain text, CSV, JSON, HTML; PDF and Office documents later, kept as `unsupported`: listed, searchable by title only), splits it into passages (paragraphs up to about 1500 characters, a heading starting a new one) and marks the item `indexed`. A new file for the same document (`PUT …/documents/{id}`) is a new version, indexed again. Loculus not answering is retried (a minute, doubled, five tries); a file that's gone or doesn't match fails at once; failures are on the item (`document.indexing.status: failed` and `error`).
- **Repository documents:** for a project with a linked repository, paths chosen per project (default `docs/`, `specs/`, `adr/`, `README.md`) are indexed at the default branch's head, and again when Proxenos reports a push touching them. These items are read-only in Seshat (`source: repository`): the repository is their source of truth, and changing them is a commit.
- **Aether-os documents** (specs and plans Hephaestus holds for projects without a repository, `tasks.md`): indexed on `document.version-published`.
- **Proposals from work:** agents propose items with a knowledge tool (`propose_knowledge`: type, title, body, references), which calls Seshat's API with their task token; meetings through the meeting task (`interaction.md`).
- **Secrets are never knowledge.** Bodies and passages are redacted with the activity log's patterns (Krepis's `redactText`) before they're stored, keeping email addresses (contacts are knowledge). Refusing items that are mostly secret material is still to come.

## Retrieval

### Pinned context (when a task is created)

A task's `context` (`tasks.md`, Task fields) lists knowledge items and documents the task should know. They're **resolved to versions when the task is created**, like agent versions: the task records which version of each item it got, so a run can be reproduced and evaluated. The agent gets them in its prompt (short items inline, documents as a list with their summaries, readable in full with Seshat's tools), marked as reference material.

Templates and automations can add context too (e.g. "always pin the project's conventions"), and a project setting can name items pinned into every task (Proposal).

### Search (while the task runs)

`POST …/knowledge/search` (`query`, `types?`, `includeProposed?`, `limit?`) returns the best passage of each matching item with the item. Built: Postgres full-text search (`websearch_to_tsquery`, English) over the passages of each item's current version; step 2 adds vectors (the caller's query embedding) and ranks both together.

The agent searches with knowledge tools built into Hephaestus's runtime (step 3), which call Seshat with the task token, so Seshat limits them to the task's project (and later its organization's shared items):

- `search_knowledge(query, types?, includeProposed?)`: hybrid search (keywords and vectors) over accepted items and document passages, ranked with recency and type (decisions and conventions above lessons when they conflict), each result with its item ID, version and source;
- `get_knowledge(id)` and `get_document(id, part?)`: an item, or a document's text;
- `propose_knowledge(...)`: a proposal, as above.

Every call is in the execution's activity log with the IDs and versions returned (`learning.md`, what the agent used).

### Rules

- **Knowledge is data, not instructions.** Documents, transcripts and proposals can contain text written to steer an agent. The prompt presents retrieved content as reference material, and nothing retrieved can grant permissions or change the task's definition of done; policies (APS) apply to it like to any tool result.
- **Conflicts are shown, not resolved silently.** When results disagree (two accepted items saying different things), search returns both with their dates and status, and the agent is told to prefer the newer decision and to propose a resolution.
- **Authorization is the token's.** A person sees the knowledge of projects they can read; a task only its own project's and its organization's shared items.

## Permissions

| Permission | Scope | project admin | approver | editor | viewer |
|---|---|:-:|:-:|:-:|:-:|
| `knowledge:read` | project | ✓ | ✓ | ✓ | ✓ |
| `knowledge:write` (create and edit items, upload documents) | project | ✓ | ✓ | ✓ | |
| `knowledge:approve` (accept or reject proposals, retire items) | project | ✓ | ✓ | | |

Built in Krepis's table. Organization owners and admins have every project permission. Organization-wide items (later): reading with `org:read`; writing and approving with `org:knowledge:write` (organization `owner`s and `admin`s, already in the table). Task tokens carry their service account's project role, so an `editor` can propose (never accept: like `task:approve`, Krepis refuses `knowledge:approve` to anything but a user).

## In Iris

A **Knowledge** page per project: search, filters by type and status, each item with its source, history and what supersedes it; upload documents; write decisions, facts and conventions; the inbox of proposals to accept, edit or reject. The task page shows the knowledge an execution used.

## Events

Seshat publishes to `seshat.events` (`events.md`, `../contracts/seshat.asyncapi.yaml`), with the item as aggregate and its `revision` (one more per event) as `aggregateVersion`: `knowledge-item.proposed`, `.accepted`, `.rejected`, `.updated`, `.superseded`, `.retired` (`itemId`, `projectId`, `type`, `status`, `version`, `sourceKind`, `supersededBy`), and `knowledge-item.indexed` (`itemId`, `projectId`, `version`, `chunkCount`) whenever an item's passages change, which is when Hephaestus embeds them (step 2). Later it consumes Polis's `project.deleted` and `organization.deleted` (deleting their knowledge), Hephaestus's `document.version-published`, and Proxenos's repository pushes.

## Open questions

- Which embedding model, and whether an organization can choose its own (every vector of a project must come from the same model to be comparable).
- Retention: is knowledge kept for the project's life by default, and do proposals that nobody reviews expire?
