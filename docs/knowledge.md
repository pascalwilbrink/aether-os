# Project knowledge

What agents know about the project they work in: its documents, the decisions taken, facts, conventions, its architecture and the lessons learned. Seshat holds it; every authorized agent can search it, and tasks can pin parts of it into their context. See `learning.md` for how this differs from skills.

Status: proposal (phase 1 of `learning.md`). Seshat exists as a separate service (an MCP server for retrieval and long-term memory, outside this repository); the parts below that Aether-os relies on are its contract with Seshat. Not built: the knowledge item types and lifecycle, project scoping by Aether-os tokens, ingestion from Loculus and repositories, pinned context on tasks, Iris pages.

## Decisions

| Decision | Choice |
|---|---|
| Owner | **Seshat.** It already is the knowledge and memory service agents reach over MCP; project knowledge is its main use. Aether-os services never keep their own copies. |
| Scope | **Per project**, plus **organization-wide** items (conventions every project shares). Never across organizations. |
| Unit | **Typed knowledge items** (`document`, `decision`, `fact`, `convention`, `architecture`, `lesson`), not free text in one memory. |
| Document content | **Lives once, in Loculus** (or in the project's repository); Seshat indexes it and keeps a reference, as `tasks.md` already decides for documents. |
| Who writes | **People write directly; agents and meetings propose.** A proposal becomes knowledge only when someone with `knowledge:approve` accepts it. |
| History | **Items are superseded, not overwritten.** A changed decision is a new item that supersedes the old one; the old one stays readable with its status. |
| Retrieval | **Two ways:** pinned into a task's `context` when the task is created (reproducible), and searched by the agent while it runs (through Seshat's MCP tools). |
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

Common fields (Proposal): `id`, `organizationId`, `projectId` (empty for organization-wide items), `type`, `title`, `body` (Markdown; for a `document`, a summary), `status`, `version` (grows with each edit), `tags`, `source` (below), `references` (documents, artifacts, commits, meetings, other items), `supersedes` / `supersededBy`, `reviewBy` (optional date after which Iris flags it as possibly stale), `createdBy`, `acceptedBy`, timestamps. A `document` item adds the document reference (`../tasks.md`, Documents: Loculus `fileId` and `sha256`, or a repository path at a commit) and its indexing state.

`source` records where an item came from, so every answer can be traced back:

| `source.kind` | Means |
|---|---|
| `person` | Written in Iris or through the API |
| `document` | Extracted from or summarizing a document (which one, which version) |
| `task` | Proposed by an agent during a task (task, execution) |
| `meeting` | Proposed from a meeting's transcript (meeting, and where in it) |
| `repository` | Indexed from the project's repository (path, commit) |

### Lifecycle

```
proposed ──(accepted)──▶ accepted ──(a newer item supersedes it)──▶ superseded
    │                       │
    └──(rejected)──▶ rejected └──(no longer true, nothing replaces it)──▶ retired
```

- **People with `knowledge:write` create items as `accepted`.** Agents (task tokens) and meetings can only create `proposed` items; someone with `knowledge:approve` accepts, edits then accepts, or rejects them, in Iris's knowledge inbox. Kerykes tells the project's approvers when proposals wait (`knowledge-item.proposed`).
- **Editing** an accepted item creates a new `version` (the history is kept and shown); a change of substance (a decision reversed) should be a new item that supersedes it, so tasks that relied on the old one can still see what they used.
- **Only `accepted` items are retrieved by default.** Search can include `proposed` items when asked, marked as unconfirmed; `superseded`, `retired` and `rejected` never come back unless asked for by ID.
- Proposal: a project setting lets some proposals be accepted automatically (e.g. `document` items from uploads), never `decision`s.

## Ingestion

- **Uploaded documents:** uploaded to Loculus as usual (`files.md`), then registered with Seshat as a `document` item (`fileId`). Seshat fetches the content with a signed download URL (never storing the URL), extracts text (Markdown, text, PDF, Office documents), splits it into chunks, embeds them and marks the item indexed; a new upload of the same document is a new version, re-indexed. Failures are visible on the item (`indexing: failed` with a reason).
- **Repository documents:** for a project with a linked repository, paths chosen per project (default `docs/`, `specs/`, `adr/`, `README.md`) are indexed at the default branch's head, and again when Proxenos reports a push touching them. These items are read-only in Seshat (`source: repository`): the repository is their source of truth, and changing them is a commit.
- **Aether-os documents** (specs and plans Hephaestus holds for projects without a repository, `tasks.md`): indexed on `document.version-published`.
- **Proposals from work:** agents propose items with a Seshat tool (`propose_knowledge`: type, title, body, references), using their task token; meetings through the meeting task (`interaction.md`).
- **Secrets are never knowledge.** Ingestion redacts what looks like a credential (the patterns of the activity log) before indexing, and refuses items that are mostly secret material.

## Retrieval

### Pinned context (when a task is created)

A task's `context` (`tasks.md`, Task fields) lists knowledge items and documents the task should know. They're **resolved to versions when the task is created**, like agent versions: the task records which version of each item it got, so a run can be reproduced and evaluated. The agent gets them in its prompt (short items inline, documents as a list with their summaries, readable in full with Seshat's tools), marked as reference material.

Templates and automations can add context too (e.g. "always pin the project's conventions"), and a project setting can name items pinned into every task (Proposal).

### Search (while the task runs)

The agent searches with Seshat's MCP tools, connected through the organization's tool server for Seshat (`auth: task-token`, `TOOL_SERVER_TRUSTED_ORIGINS`), so every call carries the task token and Seshat limits it to the task's project and its organization's shared items:

- `search_knowledge(query, types?, includeProposed?)`: hybrid search (keywords and vectors) over accepted items and document chunks, ranked with recency and type (decisions and conventions above lessons when they conflict), each result with its item ID, version and source;
- `get_knowledge(id)` and `get_document(id, part?)`: an item, or a document's text;
- `propose_knowledge(...)`: a proposal, as above.

Every call is in the execution's activity log with the IDs and versions returned (`learning.md`, what the agent used).

### Rules

- **Knowledge is data, not instructions.** Documents, transcripts and proposals can contain text written to steer an agent. The prompt presents retrieved content as reference material, and nothing retrieved can grant permissions or change the task's definition of done; policies (APS) apply to it like to any tool result.
- **Conflicts are shown, not resolved silently.** When results disagree (two accepted items saying different things), search returns both with their dates and status, and the agent is told to prefer the newer decision and to propose a resolution.
- **Authorization is the token's.** A person sees the knowledge of projects they can read; a task only its own project's and its organization's shared items.

## Permissions (Proposal)

| Permission | Scope | project admin | approver | editor | viewer |
|---|---|:-:|:-:|:-:|:-:|
| `knowledge:read` | project | ✓ | ✓ | ✓ | ✓ |
| `knowledge:write` (create and edit items, upload documents) | project | ✓ | ✓ | ✓ | |
| `knowledge:approve` (accept or reject proposals, retire items) | project | ✓ | ✓ | | |

Organization-wide items: reading with `org:read`; writing and approving with `org:knowledge:write` (organization `owner`s and `admin`s). Task tokens get `knowledge:read` and may propose (never accept: like `task:approve`, approving knowledge is for people only).

## In Iris

A **Knowledge** page per project: search, filters by type and status, each item with its source, history and what supersedes it; upload documents; write decisions, facts and conventions; the inbox of proposals to accept, edit or reject. The task page shows the knowledge an execution used.

## Events (Proposal)

Seshat publishes to `seshat.events` (`events.md`): `knowledge-item.proposed`, `knowledge-item.accepted`, `knowledge-item.superseded`, `knowledge-item.retired`, `document.indexed` (or failed). It consumes Polis's `project.deleted` and `organization.deleted` (deleting their knowledge), Hephaestus's `document.version-published`, and Proxenos's repository pushes.

## Open questions

- Embedding model and where embeddings run: through Hephaestus's model gateway (metered against the project's budget) or a platform-level model in Seshat?
- Should Seshat move into this repository as a service like the others, or stay separate with a contract in `contracts/`?
- Retention: is knowledge kept for the project's life by default, and do proposals that nobody reviews expire?
