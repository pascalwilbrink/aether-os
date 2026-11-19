# Automations

How Kairos turns something that happens elsewhere (a GitHub issue, later a schedule, a Slack message, a Jira ticket) into a task an agent runs.

Status: built in its first form (Kairos, `../kairos`); sections marked **Proposal** are not agreed yet. Related: `tasks.md` (tasks, templates, concurrency keys), `git.md` (where GitHub events come from, untrusted input), `events.md` (the `task.create` command), `identity.md` (who tasks run as).

## The model

| Concept | What it is |
|---|---|
| Automation | A **trigger** bound to the **task** an agent runs, in one project. `active`, `paused` or `archived`. Managed by the project's admins (`automation:manage`), read by its members (`automation:read`). |
| Trigger | What fires it. Built: a GitHub issue event from Proxenos (`github.issue.opened`, `github.issue.labeled`, `github.issue-comment.created`), with filters. |
| Action | The task: written in the automation (agent, title, instructions) or from a Hephaestus task template (template, version or latest, inputs), the service account it runs as, whether it works in the event's repository, and which artifact kinds need approval. Texts and inputs can use the event's fields (`{{issue.number}}`, `{{issue.title}}`, `{{issue.url}}`, `{{repository}}`, `{{author}}`, `{{label}}`). |
| Run | One time it fired: the event, and the task it started or why Hephaestus refused it. |

## Firing

1. Proxenos publishes a verified GitHub event with the repository's links to projects (`git.md`, Webhooks).
2. Kairos matches it against the organization's active automations for that event: the repository is linked to the automation's project (and is the trigger's repository, if it names one), the author has at least the trigger's role on the repository (default `write`; unknown counts as untrusted), it isn't a pull request's conversation unless asked, it isn't Aether-os's own bot unless asked, and the trigger's label was added or is on the issue.
3. Each matching automation gets a run, at most one per event, and Kairos sends Hephaestus a `task.create` command (`events.md`, Commands) in the same transaction, through the outbox: a trigger survives Hephaestus being down. The run's ID is the command's idempotency key.
4. Hephaestus answers with `task.created` or `task.create-rejected` (an unpublished agent, an archived project, invalid fields, …); the run records it. Nothing is retried after a rejection: the automation needs fixing.

**Concurrency keys** (`tasks.md`, Concurrency): an action can set a key using the event's fields, e.g. `{{repository}}#{{issue.number}}` (Iris starts new automations with that one, policy `queue`), and a policy for a task while an earlier one of the same automation with the same key hasn't finished: `queue` (it waits), `cancel-previous` (the earlier one is cancelled) or `skip` (no task; the run is `skipped`). Kairos prefixes the automation's ID, so two automations never block each other; a key longer than 160 characters once filled in is hashed.

The issue's title (and later its body) is written by whoever opened it: it reaches the agent as untrusted input (`git.md`, Untrusted input), which is why automations fire only for collaborators with write access by default.

## Not yet

- **A service account per automation** (`identity.md`): for now the automation names an existing service account, which needs a role in the project. Proposal: Kairos creates one (Pistis) with project `editor` (Polis) when the automation is created, and exchanges for its token when firing (`act` = Kairos).
- **Comment filters:** Proxenos's events don't carry the comment's body (it's in the stored delivery), so a comment trigger can't yet require e.g. `/aether` at its start.
- **Automation templates** (`tasks.md`): predefined `task_plan`s materialized when the trigger fires.
- **Other triggers:** schedules, Slack and Jira (through Proxenos), Hephaestus's own events (a task failed).
- **Watching automations and notifications** (Kerykes).

Iris has the pages: a project's automations, creating and changing one, pausing, resuming and archiving it, and its runs (`../iris/CLAUDE.md`).
