# Skills and skill evolution

How agents get better at the work itself: reusable skills that agent versions pin, created by people first, and later extracted from successful work, evaluated and published. See `learning.md` for how skills differ from project knowledge.

Status: phase 3 of `learning.md` (registry and manual creation) is **built**, and is moving from Hephaestus to Agora (below: Agora has the registry; Hephaestus and Iris switch to it next); phase 4 (evolution) is a proposal. Not built: usage and quality per skill version, extraction, evaluation, candidates and publishing.

## Decisions

| Decision | Choice |
|---|---|
| Format | **Agent Skills** folders: `SKILL.md` (front matter with `name` and a one-line `description`) and its files, as Mastra reads them. |
| Scope | **Organization**: a skill is reusable across the organization's projects. Proposal: project skills later, if a need appears. |
| Owner | **Agora**, with the agents (skills are part of what an agent is). Today they are in Hephaestus; they move with agents (Hephaestus then keeps a copy of the versions published agent versions pin, from Agora's events). |
| Versions | **Immutable and pinned**: an agent version pins a skill version; a new skill version changes nothing until a new agent version pins it. |
| What a skill may hold | **Procedure, not project facts** (`learning.md`). No credentials, no organization data beyond what the procedure needs. |
| Evolution | **Agents propose, Kriterion evaluates, people publish.** No skill version reaches an agent version without a person approving it. |

## Phase 3: the registry (built, in Hephaestus)

- `/v1/organizations/{id}/skills`: list and read (`agent:read`), create with the first version (`agent:write`), archive (no new versions; new agent versions can't choose it; versions already pinned keep running), and `…/versions` (create the next one, list, read one with its files).
- A version is the whole folder (at most 100 files, 1 MiB) and never changes; it's checked when created (`SKILL.md` at the root with the skill's `name` and a `description`, no `.` or `..` path segments).
- Agent versions pin `{ name, version, enabled }`; creating one checks each enabled skill is active and has that version.
- At run time the pinned versions are in the agent's Mastra workspace (`skill`, `skill_read`, `skill_search` tools; the prompt lists each skill's name and description and says to read one before doing what it's for), and with a sandbox their files are copied to `/workspace/skills/<name>` so their scripts can run.
- Iris: a Skills page (write and version skills) and choosing an agent version's skills.

**Moving to Agora** (after agents), in two steps:

1. **Built:** Agora has the same API (`../contracts/agora.openapi.yaml`, `agora/libs/skills`) and publishes every change (`skill.created`, `skill-version.published` with the version's files, `skill.archived`; the skill is the aggregate, its `revision` the `aggregateVersion`); `pnpm import:hephaestus` in `agora/` brings Hephaestus's skills and versions over with their IDs, at `revision` 1, publishing nothing.
2. **Next:** Hephaestus keeps a copy of skills and versions from those events (its tables, at `revision` 1 for the rows from before) and drops its skills API; Agora checks a version's skills itself instead of asking Hephaestus; Iris's skill pages call Agora. Until then Hephaestus's API stays the one Iris writes to and runs read from.

Versions travel inside the event, files included, instead of in Loculus by reference as first planned: a version is at most 1 MiB, Loculus's files belong to a project while skills belong to the organization, and Hephaestus then never has to fetch anything to run one.

### Added for learning (Proposal)

- **Usage:** the activity log already shows each `skill` / `skill_read` call; `task.outcome-recorded` (`learning.md`) carries the skill versions an execution read, so Kriterion can tell which skill versions were used in which outcomes.
- **Quality per skill version:** Kriterion keeps, per skill version, how often it was read and how the executions that read it went (verification rounds, review outcomes, feedback, cost), compared with executions of the same template that didn't. Iris shows it on the skill page.

## Phase 4: evolution (Proposal)

```
signals ──▶ candidate (an extraction task) ──▶ evaluation (Kriterion) ──▶ review (a person) ──▶ skill version ──▶ new agent version (draft) ──▶ published by a person
```

### 1. Candidates

A **candidate** is a proposed new skill, or a proposed new version of an existing one, with its evidence. Candidates come from **extraction tasks**: ordinary Hephaestus tasks from a platform task template ("Extract a skill"), run by the organization's curator agent (an agent version the organization chooses, like any other), so they get budgets, policy, tracing and review like all work.

What starts one (Kairos automations on learning signals, or a person from Iris):

- a task that succeeded in one verification round, was approved without changes and was rated good, of a template that's used often;
- the same kind of task done repeatedly with similar steps (several outcomes of one template);
- a skill whose executions keep needing revision rounds or bad ratings (a candidate for a better version);
- a person picking an execution in Iris: "turn this into a skill".

The extraction task reads the evidence (the executions' activity logs, their artifacts, review comments, verification results, and the current skill version if it improves one) and produces a **`skill` artifact** (a new artifact kind: the proposed folder, and for an improvement the diff against the current version), as a draft. Its prompt is explicit about the boundary: describe the procedure, leave out this project's facts (those can be proposed as knowledge instead).

### 2. Evaluation

Before anyone is asked to approve it, Kriterion evaluates the candidate:

- **Static checks:** the folder is a valid skill; no secrets; scripts don't reach the network or outside `/workspace`; size limits. Failing these ends the candidate (`rejected`, with the reason).
- **Comparison:** an eval suite of tasks the skill is meant for (taken from the evidence and from the template's past tasks, replayed in sandboxes against pinned inputs) runs with the current agent version and with a draft agent version that has the candidate, several times each. Measured: verification pass rate and rounds, judge scores, cost and time.
- **The bar:** better on the target tasks, and no worse on a regression set of other tasks that agent version handles. The thresholds are an organization setting with platform defaults.

Results are attached to the candidate as a Kriterion evaluation (`evaluation.completed`), and Iris shows them side by side.

### 3. Review and publishing

- A person with `agent:publish` reviews the candidate in Iris: the folder (or the diff), the evidence, the evaluation. **Approve** publishes it as a new skill version (or a new skill), with its provenance; **request changes** sends comments back to the extraction task, like any draft; **reject** ends it.
- Publishing a skill version doesn't change any agent. Agora drafts a **new agent version** for each agent whose published version pins the older version of that skill (same everything, the new skill version), and a person publishes it like any agent version. Agents only change through a version someone published, so every run stays reproducible.
- Proposal: an organization may opt in to publishing those agent versions automatically when the evaluation clears a stricter bar; never for a new skill, only for a new version of one already in use.

### 4. Afterwards

- Kriterion keeps watching the new version's outcomes; a version that does worse in practice than in evaluation is flagged in Iris (and to the skill's last approver through Kerykes).
- **Rollback** is publishing an agent version that pins the earlier skill version; the worse version can be deprecated so new agent versions don't choose it.

### Provenance

Every skill version records where it came from: `manual` (who wrote it), or `extracted` (the candidate, the extraction task, the executions it was learned from, the evaluation that cleared it, who approved it). Iris shows it, so "why does the agent do this?" always has an answer.

## Permissions

Skills keep the agent permissions: `agent:read` to read, `agent:write` to write versions and propose candidates, `agent:publish` to publish candidates and the agent versions that pin them. Extraction tasks run as service accounts like all tasks, so an agent can propose a skill but never publish one.

## Events (Proposal)

Agora (`agora.events`): `skill-version.published` (with provenance), `skill-candidate.created`, `skill-candidate.evaluated`, `skill-candidate.rejected`. Kriterion: `evaluation.completed` for candidates. Kerykes tells approvers when a candidate is ready for review.

## Open questions

- Project-level skills: needed, or are project specifics always knowledge?
- How large an eval suite is enough, and who pays for it (the organization's budget, as the curator's tasks do)?
- Should extraction also improve a skill's `description`, which decides when agents read it, separately from its body?
