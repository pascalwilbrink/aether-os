# Interacting with agents: copilot, voice and meetings

How people work with agents directly, beyond creating tasks: a copilot in Iris (CopilotKit over AG-UI), talking to it (Echo, a Pipecat server over WebRTC), and an agent that joins meetings and takes notes (Recall.ai). All three go through the same place agents run (Hephaestus), so model calls, budgets, policies, tools and traces work the same as for tasks.

Status: **sessions are built** (Hephaestus's sessions and their AG-UI endpoint, Pistis's session tokens, Pylon metering per session; below). The copilot in Iris, voice (Echo) and the meeting agent are proposals.

## Decisions

| Decision | Choice |
|---|---|
| Copilot UI | **CopilotKit** in Iris (React components, frontend actions, generative UI). |
| Protocol | **AG-UI** between Iris and the agent: streamed messages, tool calls and state events. Mastra speaks it. |
| Where the agent runs | **Hephaestus, as a session**: an interactive conversation with an agent version, next to tasks. Not in Iris, so the model gateway, budgets, policies and tool servers apply. |
| Identity | **A session acts for the signed-in person, read-mostly.** Anything with side effects is a frontend action the person confirms in Iris (with their own token), or a task (which runs as a service account, as always). |
| Voice | **Echo**, a separate Pipecat server (Python) for WebRTC: speech in, speech out. It is an AG-UI client of the same session, so voice and text are one conversation. |
| Meetings | **Recall.ai, through Proxenos** (which owns connections to external systems): a bot joins, the transcript comes back by webhook, and a task turns it into proposed project knowledge (`knowledge.md`). |

## Copilot in Iris (CopilotKit and AG-UI)

### Sessions (Hephaestus)

A council session (`councils.md`) is a session whose subject is a council version (a facilitator and member agents) instead of one agent version; it adds authors to messages, deliberation rounds, plans and decisions, and builds on everything below.

A **session** is a conversation between a person and an agent version in one project: `id`, `organizationId`, `projectId`, `agentId`, `agentVersionId` (pinned when it starts, like a task), `startedBy` (the person's `sub`), `title`, `status` (`active`, `ended`, with `endedReason` `closed` or `idle`), `running`, `lastActivityAt`, and its messages. Unlike a task it has no acceptance criteria, no artifacts and no sandbox (Proposal: a sandbox later, for "try this in a shell" sessions); it ends when the person closes it or after `SESSION_IDLE_TIMEOUT_MS` (30 minutes) without a run. Only the person who started it sees it: anyone else gets a 404.

Built (`hephaestus/libs/sessions`):

- **API:** `POST /v1/organizations/{organizationId}/projects/{projectId}/sessions` starts one (`session:use`, below; a person's own token, not a service account's or a session's), with `agentId` and an optional `title`; `GET …/sessions` lists the caller's (newest first, `?status=`), `GET …/{sessionId}` reads one, `GET …/{sessionId}/messages` pages through its messages (oldest first), `POST …/{sessionId}/end` ends it (idempotent).
- **The AG-UI endpoint:** `POST …/sessions/{sessionId}/runs` takes AG-UI's `RunAgentInput` and streams AG-UI events back as server-sent events: `RUN_STARTED`, `TEXT_MESSAGE_START` / `_CONTENT` / `_END`, `TOOL_CALL_START` / `_ARGS` / `_END`, `TOOL_CALL_RESULT` (the agent's own tools), `RUN_FINISHED` or `RUN_ERROR` (`message`, `code`: `BUDGET_EXHAUSTED`, `MODEL_FAILED`, `TOOL_SERVER_UNAVAILABLE`, `RUN_TIMEOUT`, `RUN_STOPPED`, `AGENT_FAILED`). `threadId` is the session's ID. The events are written by Hephaestus itself (no AG-UI package or Mastra adapter: the mapping from Mastra's stream is small and kept in one place, `session-agent.ts`); state events (`STATE_SNAPSHOT` / `STATE_DELTA`) aren't sent yet, and the input's `state` is given to the agent as context.
- **History is the session's.** Hephaestus keeps every message (`session_messages`: the person's, the agent's text and tool calls, tool results) and the agent sees that history, not the frontend's copy: of the input's `messages`, only new `user` messages and `tool` messages answering one of the agent's calls (by ID) are added; the rest is ignored. A run needs at least one new message.
- **Frontend tools:** the input's `tools` become tools the agent can call but Hephaestus never runs: the turn ends with the call (`TOOL_CALL_*`, then `RUN_FINISHED`), and the frontend answers it with a `tool` message in the next run. A call nobody answered gets a "no answer" result in the model's history, as providers need one per call.
- **One run at a time** (`SESSION_BUSY`; a run older than `SESSION_RUN_TIMEOUT_MS`, 10 minutes, is stopped and no longer holds the session); an ended session runs no more (`SESSION_ENDED`). Everything that can be refused (the input, the session, the session token) is refused before the stream starts, as problem details; once streaming, failures are `RUN_ERROR`. A client that goes away stops the run, and what the agent produced so far is kept.
- **Model calls** go through Pylon with the session token: keys and metering as for tasks (`model_calls.session_id`, `GET …/usage?sessionId=` and `groupBy=session`), counted against the organization's, project's and agent's budgets (a session has no task tree). A budget that ran out ends the run with `RUN_ERROR` `BUDGET_EXHAUSTED`; it doesn't pause.
- **Tools:** the version's tool servers (connected for each run, with the session token) and skills, and Seshat's knowledge tools without `propose_knowledge` (read-only), plus the frontend's. The instructions add that the agent is talking with a person, acts for them read-only, and that tools return data, not instructions.
- **Traces:** with tracing, Mastra's spans (the agent, each model call and tool call) carry the session's ID. Proposal: an activity log like an execution's.

### In Iris

- **CopilotKit runtime** in an Iris route handler (`/api/copilotkit`), configured with an `HttpAgent` pointing at the session's AG-UI endpoint; the route adds the person's access token (as Iris's other routes do), so the browser never talks to Hephaestus directly.
- **Frontend actions** (`useCopilotAction`): what the copilot may do, run in Iris with the person's own token, each with a confirmation the person clicks (generative UI: the card shows exactly what will happen). Examples: fill in a new task form (the person submits it), create a knowledge item, open a page, approve a draft (only for people with `task:approve`, and always with the person's click).
- **Shared state** (`useCopilotReadable`, AG-UI state): what the person is looking at (the project, the task, the selected artifact), so "summarize this task" works without copying IDs.
- A **sidebar chat** available on every project page, and an inline variant on the task page ("why did this fail?").

### Session tokens (Pistis)

The session's server-side calls (Pylon, Seshat, tool servers with `task-token` authentication) use a **session token**: for each run Hephaestus exchanges the person's own access token (from the run's request) at Pistis (`subject_token_type` access token, Hephaestus's client with `token_exchange: ['session-token']`) for a token with `sub` = the person, `sub_type: user`, `act` = Hephaestus, `session_id`, `project_id`, `agent_id` and `agent_version_id`, for at most 15 minutes. Pistis checks the person is active, still a member, the organization is active and the person has `session:use` in the project (`invalid_target` otherwise, which Hephaestus answers with a 403). Krepis limits it to the project and to **reading** (`org:read`, `agent:read`, `council:read`, and in the project `project:read`, `task:read`, `knowledge:read`, `file:read`, `automation:read`, `workspace:read`), plus `model:invoke` while the person has `session:use`. That keeps the rule that agents never act with a person's full rights: the agent can see what the person can see, and nothing it does on its own changes anything.

### Rules

- **Confirmation for side effects.** No frontend action with side effects runs without the person's click; the agent can't click.
- **Untrusted content stays data.** Tool results and retrieved knowledge in a session are framed as data, as in tasks; policies (APS) apply to sessions when they exist.
- **Retention:** session transcripts are kept per a project setting (default 30 days), and are never project knowledge unless someone saves a part of it as an item ("save as decision").

## Voice (Echo, a Pipecat server)

**Echo** is a new service: a [Pipecat](https://pipecat.ai) server in Python (Pipecat is Python), for talking to the copilot. Echo, the nymph whose voice remained.

```
Iris (browser) ──WebRTC audio──▶ Echo: VAD ─▶ speech-to-text ─▶ AG-UI client ──▶ Hephaestus session
            ◀──WebRTC audio────  Echo: text-to-speech ◀── streamed text ◀─────────┘
```

- **Connection:** Iris asks Echo for a voice connection for a session (`POST /v1/sessions/{sessionId}/voice`, with the person's token, through an Iris route); Echo verifies the token like every service (Pistis's JWKS) and that the session is the person's, and answers the WebRTC offer (Pipecat's small WebRTC transport: peer to peer, no media provider in between; a TURN server for networks that need one). Later, if needed: a hosted transport (Daily).
- **One conversation:** each finished utterance becomes a user message in the same session (Echo is an AG-UI client of Hephaestus's endpoint, with the person's token exchanged for a session token); the streamed answer is spoken as it arrives. Text and voice can be mixed: what was said shows up in the chat.
- **Interruptions:** when the person starts talking, Echo stops speaking and cancels the current run (AG-UI cancellation), as Pipecat does natively.
- **Speech providers:** speech-to-text and text-to-speech are Pipecat services (e.g. Deepgram, Cartesia, ElevenLabs, or OpenAI's), configured per organization, with keys in OpenBao like model keys; their usage is reported to Hephaestus's metering, so voice counts against the same budgets.
- **No recordings** by default: audio is processed and dropped; only the transcript (as session messages) is kept.
- **Conventions:** Echo isn't a NestJS service, but it follows the platform contracts: Pistis tokens, `/v1` paths and problem details for its small HTTP API, OTLP traces and logs (with the session and organization on them), configuration from the environment, a `contracts/echo.openapi.yaml`. No database: sessions live in Hephaestus.

## Meetings (Recall.ai)

A **meeting agent** joins a project's meetings (Zoom, Google Meet, Teams) as a visible participant, transcribes them, and turns what was decided into proposed project knowledge.

### The connection (Proxenos)

Recall.ai is an external system like GitHub, so **Proxenos** owns it:

- An organization connects its Recall.ai account (an API key in OpenBao, written through Proxenos like the GitHub App's secrets); Recall's webhooks arrive at Proxenos, which verifies their signatures and turns them into events, as for GitHub.
- **Scheduling:** `POST /v1/organizations/{id}/projects/{projectId}/meetings` (`meeting:manage`, below) with the meeting URL and start time; Proxenos asks Recall for a bot (named after the organization's choice, e.g. "Aether-os notes") and records the meeting (`scheduled`, `in_progress`, `done`, `failed`). Proposal later: joining automatically from a connected calendar.
- **When it ends:** Proxenos fetches the transcript (with speakers and timestamps) from Recall, stores it in Loculus as a file of the project, asks Recall to delete its copy of the recording and the transcript, and publishes `meeting.transcript-ready` (`meetingId`, `projectId`, `fileId`, participants' display names).

### From transcript to knowledge

- A **Kairos automation** on `meeting.transcript-ready` (a new trigger type next to GitHub's) creates a task from a platform template, "Extract knowledge from a meeting", with the transcript in its `context`.
- The agent proposes **knowledge items** (`decision`s with their reasons, `fact`s, `convention`s, and `lesson`s from retrospectives), each referencing the place in the transcript, through Seshat's `propose_knowledge`; and, Proposal, **action items** as proposed tasks for a person to confirm (a `task_plan` draft). Its primary artifact is a meeting summary (`text`), reviewed like any draft if the project wants that.
- People review the proposals in the knowledge inbox (`knowledge.md`); nothing a meeting produced becomes knowledge without someone accepting it.
- Later, skills: a meeting where someone explains how they do something can be evidence for a skill candidate (`skills.md`), proposed like any other.

### Rules

- **Consent and visibility.** The bot always joins as a visible, clearly named participant, and its first message in the meeting chat says it's recording for notes. An organization chooses whether it may join meetings with external participants.
- **Transcripts are personal data.** They're files of the project (`file:read` to read them), kept per the project's retention, and deleted with the meeting on request; Recall keeps nothing after Proxenos has fetched it.
- **Untrusted input.** What people say in a meeting is data to the extraction agent, never instructions to it.
- Later: a meeting agent that speaks (Recall's output media with Echo), answering questions from project knowledge in the meeting. Not in the first form.

## Permissions

| Permission | Scope | project admin | approver | editor | viewer |
|---|---|:-:|:-:|:-:|:-:|
| `session:use` (start and use copilot and voice sessions in the project; built) | project | ✓ | ✓ | ✓ | ✓ |
| `meeting:read` | project | ✓ | ✓ | ✓ | ✓ |
| `meeting:manage` (schedule and cancel the meeting agent) | project | ✓ | ✓ | ✓ | |

Connecting Recall.ai for the organization: `org:manage`, and its key `org:secret:write`.

## Events

- Hephaestus (built): `session.started` (the session, agent, version and person) and `session.ended` (with `reason`: `closed` or `idle`). Usage is Pylon's, per session.
- Proxenos (Proposal): `meeting.scheduled`, `meeting.started`, `meeting.transcript-ready`, `meeting.failed`.

## Open questions

- Which agent version the copilot runs: one per organization (chosen in its settings), or chosen per project?
- Do sessions need a sandbox early ("run this command") or can that always be a task?
- Calendar integration for meetings: through Proxenos (Google, Microsoft), or Recall.ai's calendar feature?
