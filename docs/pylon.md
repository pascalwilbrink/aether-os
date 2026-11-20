# Pylon: the model gateway

Pylon is the service every model call goes through: chat and tool-calling models for agents, embeddings for knowledge, judges for evaluation. It owns:

- the model catalogue and its prices;
- the provider keys (an agent's, an organization's, the platform's);
- metering;
- budgets.

Nothing else in Aether-os holds a provider key or calls a provider. A *pylōn* (πυλών) is the monumental gateway of a Greek or Egyptian temple.

Status: **proposal**. Today the gateway lives in Hephaestus (`hephaestus/libs/models`). `models.md` describes what it does, and that design holds unchanged: keys, models, metering, budgets. This document is about moving it into its own service, `pylon/` (port 3011), and how the other services use it.

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
POST /v1/providers/ollama/v1/chat/completions
```

The token goes where the provider's SDK puts its key (`x-api-key` for Anthropic, `Authorization: Bearer` for OpenAI and Ollama), so the SDK needs no changes. For every call, Pylon:

1. **verifies the token** and takes the organization, project, task, tree, agent and agent version from it (Identity, below). `X-Aether-Execution-Id` and `X-Aether-Purpose` (`agent`, `judge`, `summary`, …) are recorded for attribution only; they never widen access or change which budget pays;
2. **checks the model**: it must be in the catalogue and not `retired` (Ollama models, which aren't in the catalogue, excepted), and allowed by policy (Themis, later);
3. **checks every budget that applies**, narrowest first, or refuses with `402 BUDGET_EXHAUSTED`;
4. **picks the key**: the agent's, else the organization's, else the platform's when the organization may use it. Keys are cached briefly in memory, never stored outside OpenBao;
5. **forwards the request** to the provider, and the response back. Streams (SSE) are passed on as they come. Pylon reads the usage from the response or the stream's last events; for OpenAI it adds `stream_options.include_usage`. Retries on `429` and `5xx` happen only before the first byte reaches the caller;
6. **records the call** (`model_calls`, `models.md`, Metering) with its cost at the catalogue's price, and checks the budgets' thresholds.

For Ollama, Pylon calls the organization's own server through the same guarded fetch Hephaestus uses today (`https://`, no private addresses unless `MODEL_ENDPOINT_ALLOW_PRIVATE`).

### Embeddings

```
POST /v1/organizations/{organizationId}/projects/{projectId}/embeddings
{ "model": "openai/text-embedding-4-small", "input": ["…", "…"], "purpose": "knowledge" }
→ { "model": "…", "dimensions": 1536, "data": [{ "index": 0, "embedding": [ … ] }], "usage": { "inputTokens": 42 } }
```

- Allowed for a task token of that project (`model:invoke`).
- Allowed for a platform service's own token with `model:invoke` (Seshat), charged to the project in the path.
- Not allowed for people's tokens: Iris doesn't embed. Seshat embeds a search query itself when a person searches.

Inputs are batched up to the provider's limit, metered and checked against the project's and organization's budgets like any call.

### Catalogue, keys, budgets and usage

The routes Hephaestus serves today, moved unchanged. Iris calls Pylon for them (`PYLON_URL`).

- `GET /v1/models`, plus their management with `platform:manage` (`models.md`, Models).
- `…/model-keys` for organizations and agents, and `…/ollama/models` (`models.md`, Keys).
- `…/budget` on organizations, projects and agents, and task trees (below).
- Usage: `GET /v1/organizations/{organizationId}/usage` (`org:read`), totals by project, agent, task tree or execution, for a period. Iris's budget pages and Hephaestus's execution costs read it.

Agora checks a new agent version's model against the catalogue here instead of in Hephaestus's version check. It calls `GET /v1/models/{provider}/{model}`; Hephaestus still checks the version's tools and skills.

## Identity

Task tokens carry new claims, which Pistis adds when Hephaestus exchanges for them. Pistis accepts these claims only from Hephaestus's client, as it does `task_id`:

| Claim | For |
|---|---|
| `task_tree_id` | The task tree's budget |
| `agent_id`, `agent_version_id` | The agent's budget, its own keys, and attribution |

A token without them (a person's, a service account's API key) can't make model calls; only embeddings with a project, as above.

A new permission, `model:invoke` (project), is held by task tokens, through their service account's project role (`editor` and above). Platform services get it as a scope on their own tokens (`identity.md`).

## Budgets and pausing

Pylon checks; Hephaestus pauses.

- **Before an execution starts or resumes**, the runner asks `POST /v1/organizations/{id}/budget-checks` with the task's tree, agent and project. A budget that has no room keeps the task queued or paused, as now.
- **During a run**, a model call refused with `402 BUDGET_EXHAUSTED` ends the execution `paused`, with `pausedFor` set to the budget that ran out (from the problem's `budget`). Pylon publishes `budget.exhausted`.
- **Resuming**: Pylon publishes `budget.changed` when a limit is raised and `budget.window-started` when a month starts. Hephaestus consumes both and resumes the paused tasks that now have room, checking again first.
- **Task tree budgets**: Hephaestus sets them, keyed by the tree's top-level task ID, when a tree is created with `budgetUsd` or its budget is changed (`PUT …/tasks/{taskId}/budget` stays Hephaestus's API: it knows the tree and the `task:create` permission). It calls Pylon's `PUT /v1/organizations/{id}/projects/{projectId}/task-trees/{treeId}/budget` with its own token (`platform:manage`).
- **Thresholds**: `budget.threshold-reached` moves from Hephaestus to Pylon, same payload; Kerykes consumes it from `pylon.events`.

## Events (`pylon.events`)

| Event | Payload | Consumers |
|---|---|---|
| `budget.threshold-reached` | `budgetId`, `scope`, `scopeId`, `limitUsd`, `spentUsd`, `windowStart` | Kerykes, Iris |
| `budget.exhausted` | the same | Iris |
| `budget.changed` | `budgetId`, `scope`, `scopeId`, `limitUsd` | Hephaestus (resume) |
| `budget.window-started` | `windowStart` | Hephaestus (resume) |
| `model.changed` | `provider`, `model`, `status` | Agora, Iris (later) |

Pylon publishes no per-call events: a task's cost is read with the usage API when it's shown, and Kriterion gets costs from Hephaestus's `task.outcome-recorded`, which reads them from Pylon.

## Observability

- Each call is a span in the caller's trace (`traceparent` crosses into Pylon) with the GenAI semantic attributes: model, tokens, cost, key source. Never prompt content.
- Prompts and completions keep going to Langfuse from the agent's side (Mastra in Hephaestus), where the agent's steps and tools are, so they aren't recorded twice.
- Logs carry the organization, project, task and execution (Krepis's `createLogger`); request and response bodies are never logged.

## Moving there

1. **Pylon**: the service with Hephaestus's catalogue, keys, metering and budgets, the pass-through and embeddings endpoints, budget checks and events, and `pnpm import:hephaestus` copying the tables (keys stay in OpenBao, at the same paths). Pistis's new claims and `model:invoke`.
2. **Switching**:
   - Hephaestus's `ModelGateway` becomes an HTTP client of Pylon (the AI SDK providers with Pylon's `baseURL` and the task token);
   - the runner pauses and resumes from Pylon's answers and events;
   - Agora checks models with Pylon;
   - Iris's catalogue, key, budget and usage pages call Pylon;
   - Kerykes consumes `pylon.events`.
   
   Then Hephaestus's model code and tables are removed (a migration, after the import).
3. **Seshat's embeddings** (`knowledge.md`, step 2) on top of it.

## Open questions

- Should a sandboxed agent CLI call Pylon directly through the egress proxy (with its task token), or through Hephaestus? Directly is simpler, and Pylon already enforces everything; it's the point of the task token.
- Fair sharing of platform keys' rate limits between organizations: per-organization concurrency in Pylon, in memory per instance or shared through Postgres?
