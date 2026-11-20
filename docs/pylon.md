# Pylon: the model gateway

Pylon is the service every model call goes through: chat and tool-calling models for agents, embeddings for knowledge, judges for evaluation. It owns:

- the model catalogue and its prices;
- the provider keys (an agent's, an organization's, the platform's);
- metering;
- budgets.

Nothing else in Aether-os holds a provider key or calls a provider. A *pylōn* (πυλών) is the monumental gateway of a Greek or Egyptian temple.

Status: **steps 1 and 2 built** (Moving there, below): the service, `pylon/` (port 3011, `../pylon/CLAUDE.md`), with the catalogue, keys, metering, budgets, the pass-through and embeddings, and the import from Hephaestus; and every model call goes through it: Hephaestus's own gateway is gone (`hephaestus/libs/models` is a small client of Pylon), Agora checks models with Pylon, Iris's catalogue, key and budget pages call it, and Kerykes takes budget warnings from `pylon.events`. `models.md` describes what the gateway does, and that design holds unchanged: keys, models, metering, budgets. This document is about it as its own service, and how the other services use it.

## Why its own service

- **More than Hephaestus needs models**:
  - Seshat embeds knowledge (`knowledge.md`);
  - Kriterion runs judges;
  - Echo (Python) talks to models for voice (`interaction.md`);
  - the meeting agent and skill extraction summarize.
  
  With the gateway in Hephaestus, each of these either calls Hephaestus or is bent around it. Seshat's embeddings, for example, would have needed a worker in Hephaestus that reads Seshat's passages and writes vectors back, so that the two services never call each other.
- **One small service holds the keys**, not the biggest one, so a leak stays contained.
- **It is a boundary already**: catalogue, keys, metering and budgets have their own tables and API in Hephaestus, and the runner reaches them through one port (`ModelGateway`).

## Decisions

| Decision | Choice |
|---|---|
| Owner | **Pylon**, a service like the others (Krepis, Postgres with migrations, the outbox, Pistis tokens), with its spec in `contracts/` (`pylon.openapi.yaml`, `pylon.asyncapi.yaml`). |
| What moves | The catalogue (`models`, `model_prices`), the key rows (`model_keys`; the keys stay where they are in OpenBao), metering (`model_calls`), budgets (organization, project, agent, task tree) and their APIs. |
| What stays in Hephaestus | Running tasks: pausing a task when Pylon refuses a call for budget, and resuming it when there's room again. The agent loop (Mastra) with its traces and activity log, and policy on content (APS), stay too. |
| Calls | **Callers call Pylon; Pylon calls only providers, OpenBao and Polis.** Pylon never calls Hephaestus, Seshat or another caller, so no two services call each other synchronously (`engineering.md`). |
| Wire format | **Each provider's own API, passed through**: Anthropic's Messages, OpenAI's Chat Completions and Responses, Ollama's OpenAI-compatible API, under `/v1/providers/{provider}/…`. Callers keep their provider SDKs (the AI SDK providers in Mastra), with Pylon's URL as `baseURL`. Provider features stay available: prompt caching, thinking, tool formats. Pylon doesn't translate between providers. |
| Embeddings | **Pylon's own endpoint** (`POST …/embeddings`), since every caller wants the same thing from it. Embedding models are in the catalogue (`kind: embedding`). |
| Caller identity | **Pistis tokens, as everywhere.** A task token carries what Pylon needs to attribute a call and check its budgets (Identity, below). A platform service acting for a project (Seshat embedding its passages) uses its own token with `model:invoke` and names the project in the path. |
| Budgets | **Enforced in Pylon, before each call**, for every scope: task tree, agent, project, organization (`models.md`, Budgets). A refused call is `402` with code `BUDGET_EXHAUSTED` and the budget that ran out; Hephaestus pauses the task on it. |
| Moving | Like Agora: build Pylon with an import of Hephaestus's tables, then switch Hephaestus, Agora and Iris to it, then remove the code from Hephaestus. |

## API

All under `/v1`, problem details for Pylon's own errors (`api.md`). The pass-through routes are the one exception to the API rules: below their prefix, paths, bodies and provider errors are the provider's own.

### Model calls (pass-through)

```
POST /v1/providers/anthropic/v1/messages
POST /v1/providers/openai/v1/chat/completions
POST /v1/providers/openai/v1/responses
POST /v1/providers/mistral/v1/chat/completions
POST /v1/providers/ollama/v1/chat/completions
POST /v1/providers/google/v1beta/models/{model}:generateContent
POST /v1/providers/google/v1beta/models/{model}:streamGenerateContent
```

The token goes where the provider's SDK puts its key (`x-api-key` for Anthropic, `x-goog-api-key` for Google, `Authorization: Bearer` for the others), so the SDK needs no changes. Any other path is a `400`: Pylon passes on only these. For every call, Pylon:

1. **verifies the token** (a task token, with `model:invoke` in its project) and takes the organization, project, task, tree, agent and agent version from it (Identity, below). `X-Aether-Execution-Id` and `X-Aether-Purpose` (`agent`, `judge`, `summary`, …) are recorded for attribution only; they never widen access or change which budget pays;
2. **checks the model**: not `retired` (`409 MODEL_RETIRED`) and a `chat` model (`MODEL_NOT_AVAILABLE`); a model outside the catalogue (Ollama's, or one older than it) is called unpriced; allowed by policy (Themis, later);
3. **checks every budget that applies**, narrowest first, or refuses with `402 BUDGET_EXHAUSTED`;
4. **picks the key**: the agent's, else the organization's, else the platform's when the organization may use it (`409 MODEL_KEY_MISSING`), read from OpenBao for every call (`503` when it can't answer), never stored anywhere else;
5. **forwards the request** to the provider (only the provider's own headers: `anthropic-version`, `anthropic-beta`, `openai-beta`), and the response back. Streams (SSE) are passed on as they come. Pylon reads the usage from the response or the stream's events; for OpenAI and Ollama it adds `stream_options.include_usage`. A `429`, a `5xx` or no answer is tried again (`PROVIDER_RETRIES`, 2, honouring `retry-after` up to 10 seconds) before anything reaches the caller, so callers' SDKs shouldn't retry too; after that the provider's answer goes back as it is, or `502 PROVIDER_UNAVAILABLE` when it never answered;
6. **records the call** (`model_calls`, `models.md`, Metering) with its cost at the catalogue's price, and checks the budgets' thresholds, **before the answer ends**, so a caller reading usage once a call returned finds it. A caller that goes away stops the provider's answer, and what it used so far is recorded (`aborted`); a provider's refusal isn't recorded.

Pylon doesn't ask Polis on every call: a suspended organization's tasks stop where Hephaestus runs them, and its tokens expire within minutes (`identity.md`).

For Ollama, Pylon calls the organization's own server through Krepis's `guardedFetch`, as Hephaestus does for tool servers (`https://`, no private addresses unless `MODEL_ENDPOINT_ALLOW_PRIVATE`).

### Embeddings

```
POST /v1/organizations/{organizationId}/projects/{projectId}/embeddings
X-Aether-Purpose: knowledge
{ "provider": "openai", "model": "text-embedding-3-small", "input": ["…", "…"] }
→ { "provider": "openai", "model": "…", "dimensions": 1536, "data": [{ "index": 0, "embedding": [ … ] }], "usage": { "inputTokens": 42, "costUsd": "0.000001" } }
```

- Providers with OpenAI's embeddings API: `openai`, `mistral`, `ollama`; models of the catalogue with `kind: embedding` (OpenAI's `text-embedding-3-small` and `-large` are seeded), or any of an organization's Ollama server.
- Allowed for a task token of that project, or a service account's token, with `model:invoke`.
- Allowed for a platform service's own token with `model:invoke` (Seshat), charged to the project in the path.
- Not allowed for people's tokens: Iris doesn't embed. Seshat embeds a search query itself when a person searches.

Up to 256 inputs per request, sent in one call; the vectors come back in input order. Checked against the budgets that apply and metered like any call; a provider's refusal is `502 PROVIDER_REFUSED`, saying what it answered.

### Catalogue, keys, budgets and usage

The routes Hephaestus serves today, moved unchanged. Iris calls Pylon for them (`PYLON_URL`).

- `GET /v1/models`, plus their management with `platform:manage` (`models.md`, Models).
- `…/model-keys` for organizations and agents, and `…/ollama/models` (`models.md`, Keys).
- `…/budget` on organizations, projects and agents, and task trees (below).
- Usage: `GET /v1/organizations/{organizationId}/usage` (`org:read`), totals by project, agent, task tree or execution, for a period. Iris's budget pages and Hephaestus's execution costs read it.

Agora checks a new agent version's model against the catalogue here instead of in Hephaestus's version check. It calls `GET /v1/models?provider=…&model=…`; Hephaestus still checks the version's tools and skills.

## Identity

Task tokens carry new claims, which Pistis adds when Hephaestus exchanges for them. Pistis accepts these claims only from Hephaestus's client, as it does `task_id`:

| Claim | For |
|---|---|
| `task_tree_id` | The task tree's budget |
| `agent_id`, `agent_version_id` | The agent's budget, its own keys, and attribution |

Model calls need a task token (`task_id` and `project_id`); until Hephaestus sends the new claims, a task's tree and agent budgets and its agent's own keys simply don't apply to its calls. People's tokens and service accounts' API key tokens make no model calls (embeddings with a project, as above).

A new permission, `model:invoke` (project), is held by task tokens, through their service account's project role (`editor` and above). Platform services get it as a scope on their own tokens (`identity.md`).

## Budgets and pausing

Pylon checks; Hephaestus pauses.

- **Before an execution starts or resumes**, the runner asks `POST /v1/organizations/{id}/budget-checks` with the task's tree, agent and project. A budget that has no room keeps the task queued or paused, as now.
- **During a run**, a model call refused with `402 BUDGET_EXHAUSTED` ends the execution `paused`, with `pausedFor` set to the budget that ran out (from the problem's `budget`). Pylon publishes `budget.exhausted`.
- **Resuming**: as now, each runner round asks the budget check for its paused tasks and resumes those with room (a raised limit, or a new month). Pylon publishes `budget.changed` when a limit is set, so Hephaestus can check at once rather than at its next round.
- **Task tree budgets**: Hephaestus sets them, keyed by the tree's top-level task ID, when a tree is created with `budgetUsd` or its budget is changed (`PUT …/tasks/{taskId}/budget` stays Hephaestus's API: it knows the tree and the `task:create` permission). It calls Pylon's `PUT /v1/organizations/{id}/projects/{projectId}/task-trees/{treeId}/budget` with the caller's token, which needs `task:create` in the project there too (Pylon can't know the tree belongs to the project, but a wrong tree ID only limits nothing).
- **Thresholds**: `budget.threshold-reached` moves from Hephaestus to Pylon, same payload; Kerykes consumes it from `pylon.events`.

## Events (`pylon.events`)

| Event | Payload | Consumers |
|---|---|---|
| `budget.threshold-reached` | `budgetId`, `scope`, `scopeId`, `limitUsd`, `spentUsd`, `windowStart` | Kerykes, Iris |
| `budget.exhausted` | the same, once per window | Iris |
| `budget.changed` | `budgetId`, `scope`, `scopeId`, `limitUsd` | Hephaestus (checks its paused tasks at once) |

Pylon publishes no per-call events: a task's cost is read with the usage API when it's shown, and Kriterion gets costs from Hephaestus's `task.outcome-recorded`, which reads them from Pylon.

## Observability

- Each call is a span in the caller's trace (`traceparent` crosses into Pylon, and the call to the provider is a span within it, through Krepis's telemetry). Later: the GenAI semantic attributes on it (model, tokens, cost, key source), never prompt content.
- Prompts and completions keep going to Langfuse from the agent's side (Mastra in Hephaestus), where the agent's steps and tools are, so they aren't recorded twice.
- Logs carry the organization, project, task and execution (Krepis's `createLogger`); request and response bodies are never logged.

## Moving there

1. **Pylon** (built): the service with Hephaestus's catalogue, keys, metering and budgets, the pass-through and embeddings endpoints, budget checks and events, and `pnpm import:hephaestus` copying the tables (keys stay in OpenBao, at the same paths). Pistis's new claims and `model:invoke`. While step 2 was under way, Hephaestus's `USE_PYLON` flag sent agents' calls through Pylon to try it; it's gone with step 2.
2. **Switching** (built):
   - Hephaestus's `ModelGateway` is a client of Pylon: the providers' own AI SDK clients with Pylon's `baseURL` and the task token (`PYLON_URL` is required). Pylon retries a call before answering, so the AI SDK doesn't.
   - The runner asks Pylon's `budget-checks` before an execution starts, and each round for its paused tasks (resuming those with room again); a call Pylon refuses with `402 BUDGET_EXHAUSTED` pauses the task. Resuming polls rather than waits for `budget.changed`: a month rolling over changes no limit.
   - A task tree's budget is set in Pylon with the caller's token (`PUT …/tasks/{taskId}/budget` and `budgetUsd` stay Hephaestus's API). A `task.create` command can't carry `budgetUsd` (`TASK_BUDGET_INVALID`): there's no token of the sender's to set it with, and Hephaestus's own may not.
   - Executions' usage in Hephaestus's API comes from Pylon's `usage` grouped by execution.
   - Agora checks a version's model against Pylon's catalogue (an active chat model; an Ollama model isn't asked about) and Hephaestus only the tools and skills.
   - Iris's catalogue, key and budget pages call Pylon (`PYLON_URL`).
   - Kerykes consumes `budget.threshold-reached` from `pylon.events`; Hephaestus no longer publishes it.

   Hephaestus's old tables (`models`, `model_prices`, `model_keys`, `budgets`, `model_calls`) are left in its database until `pnpm import:hephaestus` has run everywhere; a later migration drops them. Run the import before deploying step 2: without it, the budgets and history Hephaestus had don't apply in Pylon.
3. **Seshat's embeddings** (`knowledge.md`, step 2) on top of it.

## Open questions

- Should a sandboxed agent CLI call Pylon directly through the egress proxy (with its task token), or through Hephaestus? Directly is simpler, and Pylon already enforces everything; it's the point of the task token.
- Fair sharing of platform keys' rate limits between organizations: per-organization concurrency in Pylon, in memory per instance or shared through Postgres?
