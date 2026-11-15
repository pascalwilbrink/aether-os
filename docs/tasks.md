# Tasks and artifacts

How Hephaestus models the work it runs and what that work produces.

Status: design in progress, documentation only. Sections marked **Proposal** are not agreed yet.

## Decisions

| Decision | Choice |
|---|---|
| Hierarchy | **Tasks and subtasks.** A subtask is a task with a parent task; there is no separate "feature" entity. |
| Task plans | **An artifact can be a new list of tasks and subtasks** (kind `task_plan`). |
| Dependencies | **Tasks have `dependsOn`** on other tasks, limited to tasks under the same top-level task. A task whose dependency failed stays `blocked` until that dependency is retried. |
| Where plan tasks attach | **As subtasks of the task that produced the plan.** That task waits for them and succeeds only when they all have. A plan can name one entry as its **deliverable**. |
| Subtask failure | **Infrastructure failures are retried by Hephaestus; other failures go to the parent**, which retries, revises its plan, or gives up. |
| Approval granularity | **Approve the plan; side effects only at the deliverable.** Pending drafts under one top-level task are reviewed together in Iris. |
| Automation templates | **Templates are predefined `task_plan`s**, materialized when the trigger fires. |
| Request changes | **Approval has three answers: approve, reject, request changes.** Requesting changes sends comments back to the task's agent, which produces a revised draft. |
| Specs and documents | **Specs are long-lived documents, not task artifacts.** They live in the project's Git repository, or, for projects without one, in Loculus as Aether-os documents. |
| Document storage | **Content lives once, in Loculus.** Both Hephaestus and Seshat can hold Aether-os documents; each holds a reference to the Loculus object, never a copy. |
| Task templates | **Reusable task definitions**, including a **definition of done** (acceptance criteria). Plan entries and automation templates can be based on them. Templates exist at **organization level and project level**. |
| Verification | **Always part of the task**, not a separate subtask: before a task can succeed, each acceptance criterion is checked (a criterion check). **`judge` checks call Kriterion's evaluators.** |
| Task outcome | **Every successful task outcome is an artifact.** A task that succeeds produces one or more artifacts. |
| Artifact kinds | Artifacts can be **many kinds of thing**: text, a pull request, a file, and so on. |
| Failed tasks | **Can produce partial ("half") artifacts**, kept for inspection and clearly marked as not an outcome. |
| Approval and side effects | Artifacts have a **draft** status: an artifact that needs approval is recorded as a draft and only delivered once approved. |
| Primary artifact | **A successful task has exactly one primary artifact**; any others are secondary. |
| Retention | **A project-level setting**, with a **separate setting for `partial` artifacts**. |
| What needs approval | **Both** the automation's own setting and Themis policy can require approval; either one is enough. |
| Deleting a task | Whether deleting a task also deletes its artifacts is **a project-level setting** (like GitHub's "delete branch after merge"). |

## Tasks and subtasks

A subtask is a task whose `parentTaskId` is set. It is a full task: the same states, artifacts (draft, primary, partial), approval, Themis policy, task token, retention and tracing (its spans nest under the parent's trace). A user-facing grouping such as "feature" can exist as a label or a view in Iris, not as its own entity.

### Dependencies

A task can list other tasks in `dependsOn`. It doesn't start until every task it depends on has succeeded. Hierarchy and dependencies are independent: `parentTaskId` says what a task is part of, `dependsOn` says what must happen before it. A plan entry's `dependsOn` becomes the created task's `dependsOn`.

Rules:

- **Succeeded means fully done.** A dependency counts as succeeded only once its outcome is `final`. If its artifacts are drafts waiting for approval, dependent tasks keep waiting.
- **No cycles.** Hephaestus rejects a dependency that would create a cycle, when the task or plan is created.
- **Same tree.** A task can only depend on tasks under the same top-level task (its siblings, their subtasks, and so on). Every dependency chain therefore lives inside one tree that is cancelled, costed and cleaned up together. Dependencies across trees may come later if a real need appears.
- **A failed dependency blocks, it doesn't cascade.** When a dependency fails or is cancelled, the tasks depending on it stay `blocked`. Retrying the failed task (by the parent, or by a person) resumes the chain. Cancelling the parent cancels everything under it, including blocked tasks.
- **Inputs from dependencies.** A dependent task can take its dependencies' artifacts as inputs (e.g. the branch a previous task produced), referenced by artifact ID.
- **Waiting state.** A task whose dependencies haven't all succeeded is `blocked`; it is not counted against concurrency limits until it can start.

When to use a subtask (Proposal): only when the work needs something of its own: a different agent version, its own sandbox, its own artifacts or approval, or retries independent of the parent. Ordinary steps inside one agent's run stay as Mastra workflow steps within a single task.

## Task templates

A task template is a reusable definition of one task: what to do, which agent does it, what it takes as input, and when it counts as done. Examples: "Fix a bug from a GitHub issue", "Write a spec", "Review a PR".

### Shape (Proposal)

| Field | Meaning |
|---|---|
| `id`, `organizationId`, `projectId` | Scope: `projectId` empty for an organization-wide template (see Scope below) |
| `title`, `instructions` | What the task should do; may contain placeholders filled from inputs (e.g. `{{issue.title}}`) |
| `agentId` | The agent to run it; its version is pinned when a task is created |
| `inputs` | The inputs a task from this template needs, with types (artifact, document version, repository file, plain value) |
| `acceptanceCriteria` | The definition of done (see below) |
| `artifacts` | What the task is expected to produce, e.g. "a `pull_request` as primary artifact" |

Rules:

- **Templates are versioned and pinned.** Editing a template creates a new version; a task records the template version it was created from (`taskTemplateId`, `taskTemplateVersion`), like it records `agentVersionId`. Running tasks never change underneath.
- **Everything can start from a template:** a task created through the API or Iris, a `task_plan` entry (`templateId` instead of writing `instructions` and `acceptanceCriteria` by hand), and an automation template's entries.
- **Extending, not loosening.** Whoever creates a task from a template (a person, a plan, an automation) can **add** acceptance criteria but not remove the template's own.
- Managing templates needs `task-template:manage` at the template's scope (see `identity.md`).

### Scope

| Scope | Visible to | Managed by | Typical use |
|---|---|---|---|
| Organization | Every project in the organization | Organization `owner`s and `admin`s | Company-wide standards: "Fix a bug", "Write a spec", with the organization's definition of done |
| Project | That project only | Project `admin`s | Project-specific work: "Release this service" |

- A project sees its own templates plus the organization's. Organization templates are shared like agents (which are organization-scoped too).
- **A project can extend an organization template, not weaken it:** a project template can be based on an organization template (`extends`, pinned to a version) and add criteria, inputs or instructions, but can't remove the organization template's acceptance criteria. That's how an organization enforces a definition of done everywhere ("tests pass", "no secrets in the diff").
- Pinning works the same at both levels: a new organization template version doesn't change existing tasks, automations or project templates until they're moved to it. Proposal: Iris shows which automations and project templates are on an older version.

### Definition of done

Every task has a definition of done: a list of **acceptance criteria**, collected from:

1. the task template it was created from;
2. criteria added when the task was created (by a person, a plan entry or an automation);
3. the spec requirements it satisfies (`satisfies: ['REQ-3']`), whose acceptance criteria are copied in (see Spec-driven development).

The list is fixed when the task is created, so the bar can't move while the task runs. Each criterion has:

| Field | Meaning |
|---|---|
| `key` | Identifier within the task, e.g. `tests-pass` or `REQ-3.1` |
| `description` | The criterion in plain language, e.g. "Existing tests still pass" |
| `check` | How it's verified (see below) |
| `source` | Where it came from: template, task, or requirement ID |

### Verification

Verification is **always part of the task**: a fixed phase at the end of every run, not a separate subtask and not optional.

1. The agent finishes its work and records its artifacts (drafts, or final if they need no approval, but nothing is delivered yet).
2. Hephaestus runs a **criterion check** for each acceptance criterion and records the results as a `verification` artifact (secondary) on the task.
3. All criteria pass → the task continues: drafts go to review, or artifacts that need no approval are delivered and the task succeeds.
4. Any criterion fails → Hephaestus resumes the agent with the failures, and it revises its work; then verification runs again. After a bounded number of rounds the task fails, its artifacts become `partial`, and the verification artifact shows what didn't pass.

Check types (Proposal):

| `check.type` | How it's checked | Example |
|---|---|---|
| `command` | A command run in the task's sandbox; exit code 0 passes | `pnpm test`, `pnpm lint` |
| `judge` | A Kriterion evaluator (LLM judge) scores the artifacts against the criterion's description, with a pass threshold | "The PR description explains the root cause" |
| `artifact` | A structural check on the artifacts | "Primary artifact is a `pull_request`", "touches no files outside `src/`" |
| `manual` | Left to the reviewer: shown as an unchecked item at review, and approving the draft confirms it | "UX copy reads well" |

Rules:

- **The checker isn't the worker.** Checks are run by Hephaestus, not reported by the agent: an agent saying "tests pass" doesn't count. `judge` checks use a separately configured judge model, never the task's own agent.
- **Kriterion runs `judge` checks.** Hephaestus runs `command` and `artifact` checks itself (in the sandbox and on its own records) and calls **Kriterion's evaluators** for `judge` checks, so "is this good enough" is defined once, in Kriterion, for both live verification and offline evals. A `judge` criterion names a Kriterion evaluator (pinned to a version) and its pass threshold.
- **Kriterion unavailable means not verified.** If Kriterion can't be reached, the check is an infrastructure failure: retried, and the task waits; it never passes by default (fail closed, like OPA).
- **Every result goes to Kriterion.** Hephaestus publishes `task.verified` with all criterion results, so Kriterion tracks pass rates per agent version and template version.
- **Reviewers see the checklist.** In Iris, a draft is shown next to its verification artifact: every criterion with passed / failed / manual, and the output of each check (test log, judge reasoning).
- **Revisions are verified again.** A revised draft after request changes goes through verification before it returns to the reviewer.
- **Planning tasks** are verified on their own plan (e.g. "every requirement is covered by an entry"); the deliverable is verified as its own task. A planning task succeeds only when its subtasks do, as before.
- **A task without criteria** still runs the verification phase, which records "no criteria"; Iris flags such tasks. (Proposal: a project setting to require at least one criterion.)

## Artifacts

### Common shape (Proposal)

Every artifact, whatever its kind, has:

| Field | Meaning |
|---|---|
| `id` | Artifact ID |
| `taskId` | The task that produced it |
| `organizationId`, `projectId` | Tenancy, copied from the task |
| `agentVersionId` | Copied from the task, so artifacts can be evaluated per agent version (Kriterion) |
| `kind` | Discriminator: `text`, `file`, `pull_request`, … (see below) |
| `status` | `draft`, `final`, `rejected`, `changes_requested` or `partial` (see below) |
| `revisionOf` | For a revised draft: the artifact it replaces (see Request changes) |
| `primary` | `true` for the task's primary artifact |
| `title` | Short human-readable name |
| `createdAt` | When it was recorded |
| `metadata` | Free-form, kind-independent key/values (e.g. labels) |

Plus kind-specific fields.

### Kinds (Proposal)

| `kind` | Kind-specific fields | Where the content lives |
|---|---|---|
| `text` | `format` (`markdown` / `plain`), `content` | Inline if small; above a size limit, in Loculus with an `objectKey` instead of `content` |
| `file` | `objectKey`, `fileName`, `contentType`, `sizeBytes`, `sha256` | Loculus |
| `pull_request` | `provider` (`github` / `gitlab` / `bitbucket`), `repository`, `number`, `url`, `headBranch`, `baseBranch`, `state` (`open` / `merged` / `closed`) | The Git provider; Hephaestus stores the reference |
| `comment` | `provider`, `target` (issue or PR reference), `url` | The Git provider |
| `json` | `schema` (optional identifier), `content` | Inline |
| `task_plan` | `entries`: a list of tasks to create (see below) | Inline |
| `verification` | `round`, `results`: per acceptance criterion its `key`, `outcome` (`passed` / `failed` / `manual`) and output (log, judge reasoning, inline or in Loculus) | Inline, large outputs in Loculus |
| `document_version` | `documentId`, `version`, `objectKey` (for a repository-backed project: `repository`, `path`, `commit` instead) | Loculus, or the repository |

Kinds are an open set: adding one means adding it to the contract (a `oneOf` with `kind` as the discriminator in `hephaestus.openapi.yaml`) and to Iris's renderer. Unknown kinds must still be listable, showing the common fields.

### Task plans

A `task_plan` artifact is a list of tasks and subtasks for Hephaestus to create. It is how agents decompose work: a planning agent's outcome is a plan, and Hephaestus turns the plan into tasks.

A plan has a list of `entries` and an optional `deliverableKey`. Each entry:

| Field | Meaning |
|---|---|
| `key` | Identifier within the plan, so entries can refer to each other |
| `title`, `instructions` | What the task should do |
| `agentId` | The agent to run it; its version is pinned when the task is created, like every task |
| `parentKey` | Makes the entry a subtask of another entry in the plan |
| `dependsOn` | Keys of entries that must succeed first |
| `inputs` | References to artifacts the task starts from (e.g. a branch or file produced earlier) |
| `templateId` | Optional task template to start from; its instructions, agent and acceptance criteria apply (see Task templates) |
| `acceptanceCriteria` | Extra criteria on top of the template's |
| `satisfies` | Spec requirement IDs this entry addresses; their acceptance criteria become the task's |

Rules:

- **Entries become subtasks of the task that produced the plan.** That task (the planning task) waits until all of them finish and succeeds only when they've all succeeded; cancelling it cancels the whole tree. Entries with a `parentKey` nest further down. Plans don't create new top-level tasks; linked follow-up tasks can be added later if needed.
- **The deliverable carries the outcome.** `deliverableKey` names the entry whose result is the plan's real outcome (e.g. the entry that opens the PR). When it succeeds, its primary artifact becomes the planning task's primary artifact, and the plan becomes a secondary artifact. Without a deliverable, the plan stays the planning task's primary artifact.
- **Nothing is created until the plan is `final`.** A plan is an artifact like any other, so it can be a `draft` that needs approval first (by automation setting or Themis policy, e.g. "plans with more than 10 tasks need approval"), and only an approved plan is turned into tasks.
- **No escalation.** Tasks created from a plan run as the same service account as the task that produced it, in the same project, under the same policy. A plan can't pick a more privileged identity or another project.
- **Bounded.** Limits on entries per plan, nesting depth, and the total number of tasks descending from one top-level task, so an agent can't fan out without bound. Cost limits roll up to the top-level task.
- **Traceable.** Every created task records the plan artifact it came from (`planArtifactId`, `planEntryKey`).
- **Automation templates are plans.** An automation can define its subtasks up front as a predefined `task_plan` with the same entry format. Hephaestus materializes it when the trigger fires. A template was written by someone with `automation:manage`, so it doesn't need approval on each run unless Themis policy requires it.

### Subtask failure

- **Infrastructure failures** (a sandbox crash, OPA unreachable, a model provider timing out) are retried automatically by Hephaestus, a bounded number of times, before anyone sees them.
- **Other failures go to the parent.** Hephaestus resumes the parent's agent (Mastra workflows can suspend and resume) with the failure and the subtask's `partial` artifacts, and the parent chooses to:
  - retry the subtask;
  - produce a revised plan, which as a new `task_plan` artifact follows the same approval rules; or
  - give up, which fails the parent.
- **Subtasks from an automation template** have no orchestrating agent; for them the default is to retry per the retry policy, then fail the parent.

### Status

| `status` | Meaning |
|---|---|
| `draft` | Prepared but not delivered, waiting for approval. For an artifact with an external side effect, nothing has happened outside Aether-os yet: a `pull_request` draft is a pushed branch plus the prepared title and description, not an opened PR. |
| `final` | The outcome. Delivered if it has an external side effect (the PR is opened, the comment posted). |
| `rejected` | A draft that was rejected at approval. Never delivered. |
| `changes_requested` | A draft a reviewer sent back with comments. Never delivered; superseded by a revised draft. |
| `partial` | Produced by a task that failed. Kept for inspection; never delivered and never primary. |

Transitions: `draft` → `final` when someone with `task:approve` approves (Hephaestus then delivers it), `draft` → `rejected` when they reject it, `draft` → `changes_requested` when they request changes. An artifact that needs no approval is recorded directly as `final`. A failed task's artifacts are recorded as `partial`, including any drafts it left behind. 

### What needs approval

An artifact needs approval (is recorded as `draft`) if **either** of these requires it:

- **The automation:** its configuration says which artifact kinds need approval (e.g. "pull requests need approval, text summaries don't").
- **Themis policy:** organization- or project-level policy can require approval on top, e.g. "every pull request against `main` needs approval" or "everything in this project needs approval".

Requirements only add up: an automation can make approval stricter than policy, but never loosen what policy requires. Tasks started through the API without an automation follow policy only.

### Request changes

Reviewing a draft has three answers, all requiring `task:approve`:

| Answer | Effect |
|---|---|
| Approve | The draft becomes `final` and is delivered. |
| Reject | The draft becomes `rejected`. The task decides what to do next, like any other failure of its work (see Subtask failure). |
| Request changes | The draft becomes `changes_requested`, with the reviewer's comments attached. Hephaestus resumes the task's agent with the comments, and the agent produces a **new draft** with `revisionOf` pointing at the old one. |

- Artifacts stay immutable: a revision is a new artifact, and the chain of `revisionOf` links is the review history. Iris shows it like the rounds of a PR review.
- Comments can be general or point into the artifact (a line of a file, a requirement in a spec, an entry in a plan).
- While waiting for review, and while revising, the task is not finished: it only succeeds once its drafts are `final`.
- Proposal: a project-level limit on revision rounds, after which the task fails instead of looping.

### Approval in task trees

- **The plan is the main checkpoint.** Approving a plan approves the breakdown of the work: the moment for a person to check the agent's approach.
- **Side effects belong at the deliverable.** Intermediate subtasks should only produce internal artifacts (branches, files, text). Only the deliverable entry changes something outside Aether-os (opens the PR), so a person reviews the combined result once instead of once per subtask.
- **Per-artifact rules still apply.** Approval is still decided per artifact as described above, so a subtask that does produce a side effect gets its own draft.
- **One review per tree.** Iris shows every pending draft under one top-level task together, to approve as a batch or one by one.

### Primary artifact

A successful task has exactly one artifact with `primary: true`: the outcome a person or caller looks at first (typically the PR, with a text summary as a secondary artifact). The task also records it as `primaryArtifactId`. Failed tasks have no primary artifact, since `partial` artifacts are never primary. For a planning task, the primary artifact is its deliverable's primary artifact once the deliverable succeeds (see Task plans).

### Project settings


Three settings per project govern artifacts (the defaults are proposals):

| Setting | Meaning | Default |
|---|---|---|
| `artifactRetentionDays` | Artifacts older than this are deleted; empty means keep forever | Keep forever |
| `partialArtifactRetentionDays` | Same, for `partial` artifacts from failed tasks | 30 days |
| `deleteArtifactsWithTask` | Deleting a task also deletes its artifacts | Off |

- Deleting an artifact (by retention or with its task) deletes its Aether-os record and its Loculus content. It **never** touches external objects: a pull request stays open on GitHub, a posted comment stays posted.
- Proposal: Hephaestus stores these settings itself, keyed by project ID, because they only govern Hephaestus data. Polis owns the project but doesn't need to know about artifacts.
- Hephaestus publishes `artifact.deleted` so consumers (e.g. Iris, Kriterion) drop their references.

### Rules (Proposal)

- **Hephaestus owns artifacts**, alongside the tasks that produce them.
- **Content goes to Loculus, references stay in Hephaestus.** Artifacts store Loculus object keys, never signed URLs; clients ask for a fresh signed URL when they download (see the design rules in `../CLAUDE.md`).
- **Artifact content is immutable once recorded.** Two things can change afterwards: the `status` (through the transitions above) and the synchronized state of external artifacts, such as a `pull_request` artifact's `state` following the real PR (`open` → `merged` / `closed`), updated from provider webhooks, which Kairos receives.
- **Events:** Hephaestus publishes `artifact.created` and, when a task succeeds, `task.succeeded` listing its artifact IDs. Kriterion and Iris consume these.

## Documents and specs

Some outputs outlive the task that produced them: a spec is edited by people, revised by later tasks, and must not disappear because of artifact retention. These are **documents**, not artifacts.

### Where documents live

| Project has | Documents live in | A version is |
|---|---|---|
| A Git repository | The repository, e.g. under `specs/` (as GitHub Spec Kit and Kiro do) | A file at a commit |
| No Git repository | **Loculus**, as Aether-os documents | An immutable object in Loculus |

Either way, a document has a stable identity and a history of immutable versions. For repository-backed projects the repository is the source of truth; Aether-os only references paths and commits.

### Aether-os documents (projects without a repository)

The content of an Aether-os document lives **once, in Loculus**. Both Hephaestus and Seshat can hold Aether-os documents, and both only **reference the Loculus object**; neither keeps its own copy of the content.

| Service | Holds documents for | Typical documents |
|---|---|---|
| Hephaestus | Work: what tasks read and produce | Specs, designs, plans |
| Seshat | Knowledge: what agents search and remember | Reference material, notes, uploaded files |

- A document belongs to a **project**, not to a task: `id`, `projectId`, `title`, `kind` (e.g. `spec`, `design`, `notes`), and a list of versions.
- Each version is an immutable Loculus object: the service stores `version`, `objectKey`, `sha256`, `createdAt`, and who created it (a person editing in Iris, or a task). Editing creates a new version and a new object, never an overwrite.
- **Cross-referencing, not copying.** A document in one service can be used by the other through its Loculus reference: Seshat indexes a Hephaestus spec for retrieval (on `document.version-published`), and a task can take a Seshat document as input. Both resolve the content from the same Loculus object.
- Artifact retention does **not** apply to documents. Deleting a document is an explicit action in the service that holds it.
- Proposal: a shared document reference shape in `contracts/` (`{ service, documentId, version, objectKey, sha256 }`), so either service, Iris and task inputs can point at any document the same way.
- Proposal: a Loculus object is deleted only when no service references it any more; each service drops its references on deletion and publishes `document.deleted`.

### How tasks produce documents

A task never writes a document directly. It produces a **draft artifact** with the proposed content; once that draft is `final` (approved, or needing no approval):

- for a repository-backed project, the content is committed to the repository as part of the task's branch, and the artifact references the file at that commit;
- for a project without a repository, Hephaestus publishes it as a new version of the Aether-os document, and the artifact references that document version.

This way specs go through the same review as everything else, including request changes.

### Task inputs

Besides artifacts from earlier tasks, a task's inputs can now be:

- a document version from Hephaestus or Seshat (a document reference with a `version`), or "latest", pinned to a concrete version when the task is created, like agent versions;
- a file in the repository (`path` at a branch or commit, pinned to a commit when the task is created).

## Spec-driven development

With the pieces above, spec-driven development is an automation template (a predefined `task_plan`):

1. **Specify:** a task produces the spec as a draft document artifact; a reviewer approves or requests changes.
2. **Plan:** depends on 1; takes the approved spec as input and produces a design and a `task_plan`, reviewed the same way.
3. **Implement:** the plan's entries become subtasks, ordered with `dependsOn`.
4. **Deliver:** the plan's deliverable entry opens the PR (or, without a repository, produces the final artifact), reviewed once.

Each step is typically a task template ("Write a spec", "Plan from a spec", …), so its definition of done comes with it.

### Requirements

- Specs have **requirements with IDs and acceptance criteria** (e.g. `REQ-3` with criteria `REQ-3.1`, `REQ-3.2`).
- Plan entries list the requirements they address (`satisfies: ['REQ-3']`); the requirements' acceptance criteria become those tasks' definition of done, and are checked by each task's own verification.
- The planning task's verification checks coverage: every requirement in the spec is satisfied by at least one entry.
- The reviewer of the deliverable sees the checklist per requirement next to the PR, not just the diff.

Proposal: requirements are parsed from a fixed spec format (a Markdown convention, e.g. a heading per requirement with an ID and a criteria list), so specs stay readable in the repository.

Later: when a spec changes after implementation, re-plan only the affected requirements, or at least flag which tasks and artifacts are out of date.

## Task lifecycle (Proposal)

### States

| State | Meaning | Holds a sandbox | Counts against concurrency |
|---|---|:-:|:-:|
| `blocked` | Waiting for its `dependsOn` tasks to succeed | | |
| `queued` | Ready to start, waiting for a concurrency slot or budget | | |
| `provisioning` | Pinning is done; Hephaestus obtains the task token, secrets, repository access and the sandbox | ✓ | ✓ |
| `running` | The agent is working (including revisions after failed checks or request changes) | ✓ | ✓ |
| `verifying` | Criterion checks are running (see Verification) | ✓ | ✓ |
| `awaiting_review` | Drafts are waiting for someone with `task:approve` | | |
| `waiting` | A planning task waiting for its subtasks | | |
| `paused` | A budget ran out (see `models.md`); state is saved, resumes to `queued` when the budget is raised or renewed | | |
| `delivering` | Approved or approval-free artifacts are being delivered (PR opened, comment posted) | | ✓ |
| `succeeded` | Terminal. Every artifact is `final`; there is a primary artifact | | |
| `failed` | Terminal. With a `failureReason`; artifacts are `partial` | | |
| `cancelled` | Terminal. Stopped by a person, the parent, or an automation rule; artifacts are `partial` | | |

Everything is resolved and pinned when the task is created (agent version, template version, document versions, repository commit), so a task in any state can be retried or resumed with exactly the same inputs.

```
            created
               │
   ┌───────────┴─────────┐
blocked ──(deps done)──▶ queued ──▶ provisioning ──▶ running ──▶ verifying ──┬─(drafts)──▶ awaiting_review
                                                       ▲   ▲                 │                 │
                                                       │   └──(check failed)─┤     (request changes: back to running)
                                                       │                     │                 │ (approved)
                                    (plan approved) waiting ◀──(task_plan)───┤                 ▼
                                         │                                   └─(no drafts)─▶ delivering ──▶ succeeded
                                         └──(all subtasks succeeded)───────────────────────────▶ delivering
      provisioning | running | verifying ──(budget ran out)──▶ paused ──(budget raised)──▶ queued
      any non-terminal state ──▶ failed | cancelled
```

`failureReason` is one of `agent_failed` (the agent gave up), `verification_failed` (still failing after the round limit), `rejected` (a draft was rejected and the task can't continue), `timeout`, `budget_exceeded` (paused longer than the project's `pausedTimeoutDays`), `infrastructure` (retries exhausted) or `subtask_failed`.

### Executions

A task runs as one or more **executions** (the `ExecutionId` already in Hephaestus): one attempt in one sandbox. A retry is a new execution of the **same task**, so dependents, plans and artifacts keep pointing at the same task ID. Each execution records its sandbox, its start and end, its usage and cost, and why it ended.

### Sandboxes across long waits

Review can take days, so a task gives up its sandbox whenever it waits (`awaiting_review`, `waiting`, `blocked`, `queued`, `paused`):

- Work in progress is saved outside the sandbox first: the branch is pushed (see `git.md`), files go to Loculus, and the agent's conversation and workflow state are stored by Mastra's storage in Hephaestus's database.
- A resume (request changes, a subtask failing back to the parent) provisions a fresh sandbox from that saved state.
- A sandbox is never resumed after its credentials expired; resuming always starts with a fresh task token.

### Timeouts

| Timeout | Default (proposal) | Set by | On expiry |
|---|---|---|---|
| Provisioning | 10 minutes | Platform | Infrastructure failure: retried |
| Heartbeat | 2 minutes without a heartbeat from the execution | Platform | Infrastructure failure: retried |
| Run (per execution, wall clock) | 60 minutes | Template or automation, capped by a project maximum | Fails with `timeout` |
| Single check | 15 minutes | The criterion | The criterion fails |
| Review | None | Optional project setting `reviewTimeoutDays` | Drafts become `rejected`, task fails with `timeout` |
| Whole task tree | None | Optional on the top-level task | Cancels the tree, `timeout` |

The run timeout covers only time spent running, not time waiting in the states without a sandbox.

### Cancellation

- Needs `task:cancel`; cancelling a task cancels everything under it, including `blocked` and `queued` subtasks.
- A running execution gets a stop signal and a grace period (30 seconds) to save its state, then the sandbox is destroyed.
- Drafts become `partial`; nothing that wasn't delivered will be.
- **Delivery isn't undone.** An artifact already delivered stays delivered (an opened PR stays open). If cancellation arrives while delivering, the delivery in progress finishes first.
- Automations can cancel too: a `concurrencyKey` with `cancel-previous` (below) cancels the older task.
- Cancelling is idempotent, and `cancelled` is terminal: to try again, create a new task.

### Retries

| Failure | Retried by | How |
|---|---|---|
| Infrastructure (sandbox crash, missed heartbeat, OPA, Kriterion or provider unreachable, provider 429/5xx) | Hephaestus, automatically | New execution, exponential backoff, at most 3 attempts per task (project setting) |
| Failed checks | The agent, within the task | Revision rounds, at most 3 (template setting), then `verification_failed` |
| Agent failure in a subtask | The parent's agent | See Subtask failure |
| Any terminal `failed` task | A person with `task:create`, or the parent | New execution of the same task, with the same pinned inputs; unblocks its dependents |

- **Delivery is idempotent.** Retrying a delivery first checks whether it already happened (e.g. an open PR for the task's branch already exists) and adopts it instead of creating a second one.
- Model calls retry within an execution (with backoff) before the execution itself is failed as `infrastructure`.

### Concurrency

Limits on tasks in a counting state (see the table above), checked when a task leaves `queued`:

| Limit | Set by |
|---|---|
| Per organization | Platform (plan or quota) |
| Per project | Project setting, at most the organization's |
| Per automation | Automation setting |

- **Fair queueing:** Hephaestus starts queued tasks round-robin across organizations, then FIFO within one, so one busy tenant can't starve others. Subtasks of a tree that's already running go before new top-level tasks, so started work finishes first.
- **Concurrency keys:** an automation can set a `concurrencyKey` (e.g. `{{repository}}#{{issue.number}}`) with a policy for a second trigger while a task with the same key is active: `queue` (default), `cancel-previous`, or `skip`. That stops a busy issue from starting five tasks.

### Events

Every state change is published as `task.status-changed` (from, to, reason), plus specific events for the moments consumers care about (see `events.md`).

## Open questions

None at the moment.
