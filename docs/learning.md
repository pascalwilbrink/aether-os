# Learning: skills and project knowledge

How Aether-os gets better with use: agents improve **how** they work (skills) and **what they know** about the environment they work in (project knowledge). This document is the overview and the plan; the two halves have their own documents, `knowledge.md` and `skills.md`, because they are built and owned separately.

Status: proposal. Built so far: skills as a registry with manual creation (Hephaestus `libs/skills`: organization skills in the Agent Skills format, immutable versions, pinned by agent versions), and much of the raw material for learning signals (executions, the activity log, verification rounds, reviews with comments, costs, traces). Nothing else here exists yet.

## Two things, not one memory

| | Skills | Project knowledge |
|---|---|---|
| Improves | **How** an agent performs a task | **What** an agent knows about the environment it performs it in |
| Examples | "How to write a migration in this stack", "how to triage a flaky test", a script that bumps versions | "We use Postgres 17", "decided: no PATCH in the API", the architecture overview, "the release branch is cut on Tuesdays", "last time the deploy failed because of X" |
| Unit | A skill version: a folder (`SKILL.md` and its files), immutable | A knowledge item (a document, decision, fact, convention, architecture note or lesson), with a history |
| Scope | The organization (reusable across projects) | One project (and organization-wide conventions) |
| Owned by | **Agora**, with the agents that use them (`skills.md`) | **Seshat** (`knowledge.md`) |
| Used through | Pinned by an agent version; the agent reads a skill before doing what it's for | Pinned into a task's `context`, and searched while the task runs |
| Changes | Rarely, deliberately, through evaluation and approval | Continuously, as the project moves on; old items are superseded, not edited away |
| Quality bar | Must make results measurably better without regressions (Kriterion) | Must be true, current and attributable to a source |
| Who writes | People; later agents propose and Kriterion evaluates | People, documents, tasks and meetings; agents propose, people accept |

**Don't mix them.** A skill must not carry project facts: a skill that "knows" this project's database name breaks in the next project and goes stale silently. Project knowledge must not carry procedure: "how to write a migration" belongs in a skill, so every project gets the improvement. Extraction (both kinds) is told which one it is producing, and review rejects items in the wrong place.

Why not one memory system: the lifecycles differ (skills are versioned releases, knowledge is a living record), ownership differs (an organization curates its skills, a project team its knowledge), retrieval differs (skills are pinned and read whole, knowledge is searched in pieces), and the quality requirements differ (skills are evaluated against tasks, knowledge is checked for truth and recency). One store would have to compromise on all four.

## Phases

| Phase | What | Outcome | Document |
|---|---|---|---|
| 1 | Project knowledge, document ingestion, retrieval | Agents share persistent project context | `knowledge.md` |
| 2 | Execution history and feedback capture | The factory collects learning signals | below |
| 3 | Skill registry and manual skill creation | Agents use reusable skills | `skills.md` (largely built, in Hephaestus; moves to Agora) |
| 4 | Automated extraction, evaluation and publishing | The factory improves through experience | `skills.md`, `knowledge.md` |

The first milestone is deliberately simple: **create a project, upload documents, add facts and decisions, and make them searchable by every authorized agent.** Learning comes after that.

Meetings (`interaction.md`, through Recall.ai) feed both: a meeting's transcript becomes proposed knowledge (decisions, facts, action items), and, later, a candidate source for skills when people explain how they do something.

## Phase 2: learning signals

Learning needs evidence. Before anything is extracted automatically, Aether-os records what happened and how well it went, per execution, in a form Kriterion and the extraction tasks can read.

### What's already recorded (Hephaestus)

| Signal | Where |
|---|---|
| What the agent did: model calls, tool calls, the runner's steps | The execution's activity log (`tasks.md`, Activity) and its trace |
| Whether the work met the definition of done, in how many rounds | `verification` artifacts and `task.verified` |
| What reviewers thought: approved, rejected, changes requested with comments | The artifacts' `review` and the revision rounds |
| Whether the outcome held up after delivery | The `pull_request` artifact's state (merged or closed), from GitHub through Proxenos |
| What it cost | `model_calls` per execution, `usage` |
| How it ended | The execution's status and `failureReason`, retries |

### What's added (Proposal)

- **Explicit feedback.** People rate a task's outcome or one artifact: `POST …/tasks/{taskId}/feedback` (`task:read` to give it on tasks they can see; one per person per target, replaceable) with `rating` (`good` / `bad`) and an optional `comment`. Stored in Hephaestus with the task; published as `task.feedback-recorded`. Iris shows the buttons on the task page and next to each artifact.
- **What the agent used.** The activity log records which skills the agent read (`skill` tool calls) and which knowledge items it retrieved (Seshat tool calls) and which items were pinned in its `context`, by ID and version. That is what lets a signal be attributed to a skill version or a knowledge item.
- **Learning records.** When a task ends, Hephaestus publishes `task.outcome-recorded`: the task, its agent version, template version, the skill versions and knowledge items used, verification rounds, review outcome, delivery outcome, feedback so far and cost. IDs and numbers only, never content: a consumer reads content through the APIs, with its own permissions.

### Who uses them

- **Kriterion** keeps quality per agent version, template version and skill version (pass rates, rounds, review outcomes, feedback), and is what decides whether a candidate skill is better (`skills.md`).
- **Extraction tasks** (phase 4) start from them: a task that succeeded in one round, was approved without changes and was rated good is a candidate source for a skill; a failure with a clear cause is a candidate source for a lesson learned.
- **People**, in Iris: which skills and knowledge an execution used, next to how it went.

### Rules

- **Signals never change what a task did.** They're recorded after the fact; a rating doesn't reopen a task.
- **Signals are tenant data.** They stay in the organization; nothing learned in one organization is used in another. Platform-wide improvements, if ever, would need an explicit opt-in.
- **No content in events.** Prompts, completions and artifact content stay where they are (Hephaestus, Langfuse, Loculus) under their own retention and redaction.

## Open questions

- Should feedback have more than two values (or a free-form score), and may service accounts give it (e.g. an automation that marks an outcome bad when a deployment fails)?
- How long learning records are kept, and whether deleting a task removes its signals.
