# Councils

A **council** is a persistent, configurable virtual team: a facilitator, specialist members, several ways of working together, and the ability to plan and delegate real work. It is more than a group of agents answering the same prompt. It is a place where agents investigate, discuss, challenge, plan, execute and review work together, with people overseeing it.

Councils are one of Agora's central concepts, next to agents. They aren't a kind of agent, and they aren't a wrapper around a Mastra workflow.

Status: **proposal**, steps 1 and 2 and the deliberation rounds of step 3 built (Building it, below): councils and their versions in Agora, Hephaestus's copy and Iris's Councils page; council sessions in Hephaestus (the facilitator, `ask_member`, `invite_members`, members addressed directly, messages with authors) and Iris's session page; deliberation rounds (`start_round`, `conclude_round`). Modes, synthesis, planning and decisions are still to come.

## Principles

| Principle | What it means here |
|---|---|
| Reusable | A council is defined once per organization and used in any project, in any number of sessions. |
| Dynamic participation | The facilitator decides which members are relevant to what's being discussed; only `required` members always take part. |
| Multiple collaboration modes | Direct questions, facilitated conversation, deliberation rounds, planning, delegation (Collaboration modes, below). |
| Persistent collaboration | A session keeps its history, decisions, plans and artifacts; it can be picked up later. |
| Action-oriented | A council can create plans, assign tasks to its members and follow their execution. |
| Agent independence | Members are ordinary Agora agents. They can still be used on their own, in tasks and sessions, and a council never changes them. |
| Runtime independence | A council definition is data, not code: the session runner and the facilitator's tools drive it, never a static Mastra workflow. |
| Human oversight | People review plans before anything is created, approve actions, and can step in at any point. |
| Extensible | New agents, tools and collaboration strategies fit without redesigning the domain model: modes and strategies are named, versioned settings. |

## Decisions

| Decision | Choice |
|---|---|
| Who owns definitions | **Agora**, with agents: councils and their immutable, numbered **versions** (draft → published → deprecated, one published at a time). Organization-scoped, like agents, so any project can use them. |
| Who runs sessions | **Hephaestus**, next to tasks and copilot sessions (`interaction.md`): it already runs agent versions with Mastra, owns tasks, executions and artifacts, and calls models through Pylon. A council session is a session whose subject is a council version instead of one agent version. |
| Reproducibility | **Pinned when a session starts**: the council version and each member's published agent version (as tasks pin `agentVersionId`). A new published version applies to new sessions. |
| Plans | **`task_plan` artifacts** (`tasks.md`), extended with **milestones**. A council's plan is reviewed like any draft artifact and only becomes tasks once approved. |
| Tasks, executions, artifacts | **Hephaestus's own**: a council delegates by creating ordinary tasks for its members. Nothing about a task changes because a council made it. |
| Task assignment | **The task's agent, with its provenance**: who assigned it (the facilitator or a person), from which session and plan entry, and why. |
| Decisions | **Seshat `decision` items** (`knowledge.md`), which gain structured `rationale` and `alternatives`. The facilitator proposes them; people accept them, so a council's decisions become the project's knowledge. |
| Identity | **The session acts for the person who started it**, with read-only session tokens (`interaction.md`). **Delegated tasks run as a service account** chosen when the session starts, created only once a person with `task:create` approves the plan. |
| Orchestration | **The facilitator is an agent with council tools** (invite, ask, run a round, conclude, propose a plan, record a decision). The session runner carries out what it calls, within the council's settings; everything else is ordinary model calls through Pylon. |

## The model

| Concept | What it is | Owner | Built from |
|---|---|---|---|
| **Council** | A named virtual team: facilitator, members, settings | Agora | New |
| **CouncilVersion** | An immutable version of a council's configuration | Agora | New, like agent versions |
| **CouncilSession** | An ongoing interaction with a council in a project | Hephaestus | A session (`interaction.md`) with a council version |
| **CouncilMessage** | A message in a session: from a person, the facilitator or a member | Hephaestus | Session messages, with an author |
| **DeliberationRound** | One round of collaborative discussion on a question | Hephaestus | New |
| **Plan** | A structured plan made by an agent or a council | Hephaestus | `task_plan` artifact |
| **PlanMilestone** | A milestone within a plan | Hephaestus | New field of `task_plan` |
| **Task** | A unit of work | Hephaestus | Task (`tasks.md`) |
| **TaskAssignment** | A task given to an agent, by whom and why | Hephaestus | The task's agent and its provenance |
| **Execution** | An actual runtime execution of a task | Hephaestus | Execution (`tasks.md`) |
| **Artifact** | Documents, reports and other deliverables | Hephaestus (files in Loculus) | Artifact (`tasks.md`) |
| **Decision** | A recorded decision, its rationale and alternatives | Seshat | `decision` knowledge item |

### Council and CouncilVersion (Agora)

A council: `id`, `organizationId`, `key` (a slug unique in the organization, e.g. `software-architecture`), `name`, `description`, `status` (`active`, `archived`), the published version.

A version holds the whole configuration and never changes:

```yaml
key: software-architecture
name: Software Architecture Council
description: A council for software design and architecture decisions.

facilitator:
  agentId: architecture-facilitator

members:
  - agentId: solution-architect
    participation: required
  - agentId: backend-engineer
    participation: required
  - agentId: security-specialist
    participation: conditional
    when: Authentication, authorization, data handling or anything exposed to the internet.
  - agentId: critical-reviewer
    participation: optional
    role: Challenges assumptions and looks for what the others missed.

settings:
  defaultMode: facilitated
  allowDirectInteraction: true
  allowDiscussion: true
  allowPlanning: true
  allowDelegation: true
  requireSynthesis: true

discussion:
  maxRounds: 3
  allowAgentResponses: true
  requireFacilitatorConclusion: true
```

- **Agents are referenced, never copied.** `agentId` names an agent of the organization; the API takes its ID, and Iris and imports may show or accept its name. An agent can be the facilitator of one council and a member of others, and still be used on its own.
- **Participation:**
  - `required`: always takes part in rounds and planning;
  - `conditional`: takes part when the facilitator judges `when` applies to what's discussed;
  - `optional`: only when the facilitator or a person invites it.
- **`role`** (optional) tells the facilitator and the other members what a member is there for, in this council. It adds to the agent's own instructions in the session; it never replaces them.
- **Checks when a version is created** (as Agora checks agent versions): every agent exists, isn't archived and has a published version; the facilitator isn't also a member; `defaultMode` is one the settings allow; `maxRounds` is within the platform's limit.

### CouncilSession, CouncilMessage and DeliberationRound (Hephaestus)

A **session**: `id`, `organizationId`, `projectId`, `councilId`, `councilVersionId` and the member agent versions (pinned when it starts), `startedBy` (a person), `serviceAccountId` (for delegated tasks), `mode` (the current one), `status` (`active`, `waiting` (for a person), `ended`), its usage, timestamps. It can be resumed until it's ended; ending keeps everything.

A **message**: `id`, `sessionId`, `author` (`user` with the person's `sub`, `facilitator`, or `member` with the agent and its version), `kind` (`message`, `question` (to a member), `answer`, `synthesis`, `event` (a plan proposed, a task finished, …)), `content`, `roundId` (when part of a round), references (artifacts, tasks, decisions), usage for agent messages.

A **deliberation round**: `id`, `sessionId`, `number`, `question` (what the facilitator put to the council), `participants` (the members the facilitator chose, required ones always included), `status` (`open`, `concluded`), `conclusion` (the facilitator's, when `requireFacilitatorConclusion`), and its messages in order.

## Collaboration modes

A session is in one mode at a time; the facilitator or the person switches between those the settings allow. Each mode is a **strategy**, named and versioned with the council, so new ones can be added without changing the model.

| Mode | Setting | How it works |
|---|---|---|
| `direct` | `allowDirectInteraction` | The person addresses one member (`@backend-engineer`); that member answers with the session's history. The facilitator stays out unless asked. |
| `facilitated` | (always) | The person talks to the facilitator, who answers, asks members questions (`ask_member`), or starts a round. The default for most councils. |
| `discussion` | `allowDiscussion` | Deliberation rounds (below) on a question, up to `discussion.maxRounds`, ending in the facilitator's conclusion. |
| `planning` | `allowPlanning` | The facilitator drafts a plan with the members' input (often after a discussion) and proposes it for review. |
| `delegation` | `allowDelegation` | An approved plan becomes tasks for members; the session follows their executions and reviews their artifacts. |

**Synthesis** (`requireSynthesis`): after a discussion, and when a session ends, the facilitator writes a synthesis (what was asked, what was concluded, what was decided, what's open), kept as a `text` artifact of the session.

### Deliberation rounds

1. The facilitator opens a round (`start_round`) with a question and the participants: the required members, the conditional ones it judges relevant (saying why), and any optional ones it or the person invited.
2. Each participant answers in turn. With `allowAgentResponses`, later participants see earlier answers in the round and can respond to them (agree, challenge, add); without it, they answer independently, which is cheaper to run in parallel and avoids anchoring.
3. The facilitator concludes the round (`conclude_round`): agreement, disagreements and what's still open. With `requireFacilitatorConclusion`, a round can't end without one.
4. Another round follows if the facilitator judges it useful, up to `maxRounds`; the person can also ask for one, or stop the discussion.

Members can use their own tools while answering (e.g. read the repository through a tool server, search project knowledge), with the session's read-only token: a discussion never changes anything.

## Planning and delegation

- **A plan is a `task_plan` artifact** (`tasks.md`): entries with titles, instructions, the member to do each (`agentId`, one of the council's members), dependencies and acceptance criteria. Councils add **milestones**:

  ```yaml
  milestones:
    - key: design
      title: Agreed design
      description: The API and data model reviewed by the council.
    - key: implementation
      title: Working implementation
      dependsOn: [design]
  entries:
    - key: api-design
      milestoneKey: design
      agentId: solution-architect
      title: Draft the API
      # instructions, acceptanceCriteria, ...
  ```

  A milestone is reached when all its entries have succeeded; it can depend on other milestones (its entries then wait for theirs). Milestones are shown and tracked; they create no tasks of their own.
- **Plans are always drafts in a council.** The facilitator proposes one (`propose_plan`); a person reviews it like any draft artifact: approve, reject, or request changes, which the council turns into a revised plan.
- **Approval creates the work.** On approval by someone with `task:create` (and `task:approve`, as for any draft), Hephaestus creates a top-level task for the plan (its title, run by the facilitator, which oversees it), with the entries as its subtasks, as for any plan. The tasks run as the session's service account, in the session's project, under the same rules as every task: pinned agent versions, sandboxes, verification, budgets, reviews.
- **Assignment** is recorded on each task: the agent (from the entry), `assignedBy` (the facilitator, or the person who changed it during review), the session, the plan and the entry, and the facilitator's reason. A person can reassign an entry while reviewing the plan; a task that started keeps its agent (cancel and re-plan to change it).
- **Oversight:** the session follows its tasks (Hephaestus's own task events): the facilitator is told when tasks finish, fail or wait for review, posts it in the session, and can propose a revised plan for what failed. Artifacts that need approval wait for a person, as always.

## Decisions

The facilitator records decisions as they're reached (`record_decision`): Seshat `decision` items in the session's project with:
- the decision itself and its context (as now);
- a structured **`rationale`**;
- **`alternatives`**: what else was considered and why it wasn't chosen;
- the session as their source (`source.kind: council`, with the session and round).

They're proposed, like everything an agent writes to project knowledge, and become knowledge when a person accepts them (in the session, or in Seshat's inbox). An accepted decision is what later tasks and sessions find when they search the project's knowledge.

## The facilitator's tools

The facilitator is an ordinary agent of the organization (with its own instructions, model and tools); in a session it also gets the council's tools, which the session runner carries out within the council's settings:

| Tool | Does |
|---|---|
| `ask_member(agentId, question)` | One member answers, in the session |
| `invite_members(agentIds, reason)` | Adds conditional or optional members to the conversation |
| `start_round(question, participants)` / `conclude_round(conclusion)` | Runs a deliberation round |
| `set_mode(mode)` | Switches mode, among those allowed |
| `propose_plan(plan)` | Proposes a `task_plan` with milestones, for review |
| `record_decision(decision)` | Proposes a decision to Seshat |
| `write_synthesis(text)` | Records the session's synthesis |
| `ask_user(question)` | Waits for the person (`status: waiting`) |

Refusals are explained to the facilitator (a mode that isn't allowed, a member that isn't in the council, a round past `maxRounds`) so it can carry on. Nothing in the definition prescribes the order of these calls: that's the facilitator's judgement within the settings, which is what keeps councils independent of fixed workflows.

## In Iris

- **Councils** (organization): list, create and edit versions (facilitator, members with participation and role, settings), publish, archive; next to Agents.
- **A session** (project): the conversation with authors (the person, the facilitator, each member), rounds shown as threads with their conclusion, the current mode, who's taking part and why, proposed plans to review (milestones and entries, with assignments that can be changed), the tasks they became and their progress, decisions to accept, and the synthesis. Live, like the copilot (AG-UI over the session's endpoint, `interaction.md`).
- **Starting one** from a project: choose a council and a service account for delegated work, and a first message.

## Identity, permissions and budgets (Proposal)

- **Definitions:** `council:read`, `council:write`, `council:publish` in the organization, given to the same roles as `agent:*`.
- **Sessions:** `session:use` in the project to start or take part (`interaction.md`); approving a plan needs `task:approve`, and creating its tasks `task:create`, both in the project.
- **Tokens:** a session's calls (models through Pylon, tool servers, Seshat) use a **session token** (`interaction.md`): the person as `sub`, Hephaestus as `act`, `session_id`, read-only permissions. Pylon accepts it for model calls with `model:invoke`, and attributes them to the session and to each member agent (`agent_id` per call).
- **Budgets:** a session's calls count against its project's and each member agent's budgets in Pylon. A council can set `settings.maxCostUsd` per session, which Pylon enforces as a `session` budget scope; a session out of budget stops with a message and waits, rather than failing. Delegated tasks have their own task tree budget, as always.

## Events (Proposal)

- **Agora:** `council.created`, `council.archived`, `council-version.published` (the whole version) and `council-version.deprecated`. Hephaestus keeps a copy of the published versions, as it does for agents.
- **Hephaestus:**
  - `council-session.started` / `.ended`;
  - `deliberation-round.concluded`;
  - `council-plan.proposed` (with the artifact);
  - plus the usual task and artifact events for the work they lead to.
- **Seshat:** `knowledge-item.proposed` for decisions, as now.

Kerykes tells people when a session waits for them: a plan to review, a question from the facilitator, decisions to accept.

## Building it

1. **Definitions (built):** councils and versions in Agora (`/v1/organizations/{id}/councils`, `…/versions`, `…/publish`, `…/archive`; `council:read`, `council:write`, `council:publish`; the checks above, at creation and again at publishing; `COUNCIL_ALREADY_EXISTS`, `COUNCIL_ARCHIVED`, `COUNCIL_VERSION_INVALID`), its events, Hephaestus's copy (`CouncilsService.publishedVersion` for the sessions to come), and Iris's Councils page (linked from Agents). Settings a request leaves out take defaults (`facilitated`; direct interaction, discussion, planning and synthesis on; delegation off until step 4; three rounds, members responding to each other, the facilitator's conclusion required); `maxRounds` is at most 10 and a version has at most 12 members.
2. **Sessions (built in Hephaestus; Iris's session page to come):** a session (`interaction.md`) started with `councilId` instead of `agentId` pins the council's published version, its facilitator's published agent version (the session's `agentId` / `agentVersionId`) and each member's (`members`: agent, version, name, participation, role, condition, `invited`; a member without a published version refuses the session). Messages have an `author` (`user`, `agent`, `facilitator`, `member` with its agent and version), and each assistant message of a run is announced with an AG-UI `CUSTOM` event `message-author`.
   - **Facilitated:** the facilitator answers, with the council's tools: `ask_member(agentId, question)` runs that member's turn in the session (its own instructions, model, tool servers, skills and read-only knowledge, with its own session token, so Pylon meters each member's calls to it), streamed into the conversation between the facilitator's call and its result, which is the member's answer; only required members and the ones invited can be asked (otherwise the facilitator is told to invite first). `invite_members(agentIds, reason)` brings conditional and optional members in (`invited`, kept when the run ends). Calls run one at a time, so members answer in turn. The facilitator's instructions list the members (name, `agentId`, role, participation, condition, whether taking part) and how to work with them.
   - **Direct:** with `allowDirectInteraction`, a run with `forwardedProps.memberAgentId` is answered by that member (who is then taking part); otherwise, or for an agent that isn't a member, `SESSION_MEMBER_INVALID` before anything is kept.
   - **What members see:** the conversation as a transcript (who said what, without tool calls; the most recent 40,000 characters, earlier parts left out with a note), then the question. A summary by the facilitator for long sessions is still to come. The facilitator's history keeps members' answers to its calls in the calls' results, and shows answers to the person's direct questions as what the member said.
   - Frontend tools are offered to the facilitator, not to members. Modes beyond these two, and a session's current `mode`, come with discussion (step 3); automations don't start council sessions yet.
3. **Discussion:** deliberation rounds and conclusions (built), synthesis and modes (to come).
   - **Rounds (built):** with `allowDiscussion`, the facilitator also gets `start_round(question, participants, reason?)` and `conclude_round(conclusion)`. `start_round` takes the required members and the ones named (conditional and optional ones are invited by naming them; anyone who isn't a member is refused), announces the round (AG-UI `CUSTOM` `round-started`: round, number, question, participants), and runs each participant's turn in that order, as `ask_member` does (their own instructions, model, tools and session token), with the round's question and a note that it's a round: with `allowAgentResponses` each sees the earlier answers (the transcript includes them) and is asked to respond to them; without, each answers from the conversation as it was when the round started. Their messages carry the round (`roundId`, also in `message-author`), and the result is every answer (or why one failed), the rounds left and what to do next. `conclude_round` records the conclusion (`round-concluded`). Refused, with the reason told to the facilitator: a round while one is open when `requireFacilitatorConclusion` (otherwise the open one is closed without a conclusion), a round past `discussion.maxRounds` in the session, concluding with no round open. The facilitator's instructions say how rounds work, how many are left and which is open; on later turns its history has a round's answers only in `start_round`'s result. Rounds are kept with the run's messages (`deliberation_rounds`: number, question, participants in order, `open` / `concluded`, conclusion; `GET …/sessions/{id}/rounds`), and a concluded one publishes `deliberation-round.concluded`. Iris's session page shows each answer's round in the conversation and lists the rounds with their conclusions.
   - **Still to come:** modes (`set_mode`, a session's current `mode`), `write_synthesis` and `requireSynthesis`, the person asking for another round or stopping the discussion from Iris (they can already ask in words), and members answering in parallel when `allowAgentResponses` is off (they answer in turn for now: below).
4. **Planning and delegation:** milestones in `task_plan`, `propose_plan`, review and approval creating tasks, assignment provenance, following tasks in the session.
5. **Decisions:** `record_decision`, Seshat's `rationale`, `alternatives` and `council` source.

Each step is usable on its own; sessions (step 2) depend on Hephaestus's sessions from `interaction.md`, built first or together.

## Open questions

- Should members answer in parallel when `allowAgentResponses` is off (faster, the same cost), or always in turn so the transcript reads naturally? Built: in turn, since a member's answer streams into the conversation as it's written.
- How much of the session's history does each member see? Built: everything, as a transcript, cut to the most recent part when long; a summary by the facilitator once it gets long is still to come.
- Can a council be scoped to projects (only usable in some), or is organization-wide enough?
- Should a session be startable by an automation (Kairos), e.g. "convene the architecture council on issues labelled `rfc`", with a person reviewing its plan? Not before planning and delegation (step 4).
- Do members ever act in a session (beyond reading), or is acting always a task? This proposal says always a task.
