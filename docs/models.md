# Model access and cost

How agents reach LLM providers, whose keys they use, and how usage and cost are measured and limited.

The gateway is moving out of Hephaestus into its own service, **Pylon** (`pylon.md`; the service is built, the callers switch next): the same catalogue, keys, metering and budgets, called over HTTP by Hephaestus, Seshat, Kriterion and Echo. What follows describes what the gateway does, wherever it runs.

Status: agreed design. Sections marked **Proposal** are not agreed yet. The gateway is **Pylon** now (`pylon.md`, `../pylon/`): Hephaestus calls models through it with the task token, and everything below that was built in Hephaestus's `libs/models` moved there unchanged. Built so far: the gateway resolving an agent version's model with the agent's own key, else the organization's, else the platform's if allowed (`PLATFORM_MODEL_KEYS`), from OpenBao; calls through Mastra's model router with retries on 429/5xx; metering of every call (tokens, cache reads and writes, key source, attribution) in `model_calls`, totalled per execution; and the **model catalogue** (`/v1/models`: models and their versioned prices; agent versions must name an active model, and every call is priced). and **budgets** (below, Built so far), and **setting keys** through the API and Iris (Keys, below). Not yet: policy checks, fallback models, the gateway's HTTP endpoint, and LLM spans to Langfuse.

## Decisions

| Decision | Choice |
|---|---|
| Where calls go | **Through one model gateway**, never directly from an agent or a sandbox. Built **inside Hephaestus** (a `ModelGateway` port over Mastra's model router); moving to its own service, **Pylon** (`pylon.md`), which every caller reaches over HTTP. |
| Provider keys | **Both:** an organization brings its own keys (BYOK), or uses platform keys if its plan allows. Keys live in OpenBao. |
| Model choice | **The agent version names the model**; Themis policy can restrict which models an organization or project may use. |
| Metering | **Every call is metered**: tokens and cost recorded per call, attributed to task, execution, agent version, project and organization. |
| Budgets | **Per task tree, per project and per organization**, enforced before each call. Hitting a hard limit **pauses** tasks; it doesn't fail them. |

## The gateway

Every model call, whichever component makes it, goes through the gateway:

- the task's agent (Mastra, running in a Hephaestus worker);
- an agent CLI running *inside* a sandbox (Proposal, later), which calls the gateway with its task token and never gets a provider key;
- `judge` checks in Kriterion, on behalf of a task (they carry the task's token, so they count toward the task's budget).

The gateway:

1. authenticates the caller (a task token, or a service token acting for a task);
2. checks the model against policy (allowed models for the organization and project, data-residency rules);
3. checks and reserves budget (below);
4. picks the key: the agent's own key for that provider, else the organization's, else the platform key if allowed;
5. calls the provider, with retries on 429/5xx and the agent version's optional fallback models;
6. records usage and cost, emits the LLM span (to Langfuse via the Collector) and releases the unused part of the reservation.

Why a gateway instead of each component calling providers: one place for keys, budgets, metering, policy and retries; nothing else ever needs a provider key.

## Keys

| Source | Stored at | Used when |
|---|---|---|
| Agent (BYOK) | `orgs/{organizationId}/agents/{agentId}/llm/{provider}` in OpenBao | First, if the agent has its own key for that provider (e.g. to bill a separate provider account) |
| Organization (BYOK) | `orgs/{organizationId}/llm/{provider}` in OpenBao | If the agent has none for that provider |
| Platform | `platform/llm/{provider}` | If the organization has no key for that provider and its plan includes platform usage |

- Organizations manage their keys with `secret:write` (organization-wide); keys are write-only through the API, as with every secret.
- Built: `GET /v1/organizations/{organizationId}/model-keys` (`org:read`) and `PUT`/`DELETE …/model-keys/{provider}` (`org:secret:write`), and the same under `…/agents/{agentId}/model-keys` (read with `agent:read`). Hephaestus writes the key to OpenBao and keeps only a row per key (`model_keys`: scope, provider, its last four characters as a `hint`, who set it and when), so lists never touch OpenBao and never return a key. OpenBao unavailable is a `503` and nothing is stored. An agent's keys are set by the organization's owners and admins too (`org:secret:write`), not by whoever can edit the agent: a key is the organization's money. In Iris: the organization's **Model keys** page, and on the agent's page which key its model uses and its own.
- **Ollama** (`ollama`, a server the organization runs): its settings are the server's `baseUrl` and an optional key (for a server behind an authenticating proxy), stored like a key (`{ baseUrl, apiKey? }` at the same paths; `model_keys` keeps the URL and the key's hint). Hephaestus calls its OpenAI-compatible API (`<baseUrl>/v1`) through the same guarded fetch as tool servers: `https://`, never a private or loopback address and no redirects, unless `MODEL_ENDPOINT_ALLOW_PRIVATE` (local development). Its models aren't in the catalogue: an agent version can name any (`ollama/qwen3:8b`), Iris offers what the server has (`GET /v1/organizations/{organizationId}/ollama/models`, its `/api/tags`), and its calls are counted but unpriced, so they don't count against budgets.
- Proposal: a project can override with its own key (`orgs/{organizationId}/projects/{projectId}/llm/{provider}`), between the agent's and the organization's.
- With platform keys, the gateway also shares provider rate limits fairly between organizations (per-organization concurrency on model calls), so one tenant can't exhaust them for everyone.

## Models

- An agent version names its model (`provider/model`, e.g. `anthropic/claude-sonnet-5-5`), optional fallbacks, and default parameters. Pinned with the version, like everything else.
- Themis policy decides what's allowed: e.g. "only models hosted in the EU", "no model from provider X in this project". A denied model fails the call (closed), it is never silently replaced.
- The platform's **model catalogue** (Pylon's): the models agent versions can name, and their prices.
  - A **model** is a provider (a fixed list in code, `ModelProvider`, since each needs gateway support and a key path), the provider's API model ID (`claude-sonnet-5-5`, what agent versions name), a display name, `contextWindow` and `maxOutputTokens`, and a status: `active` (new agent versions can choose it), `deprecated` (versions that have it keep running, new ones can't choose it), `retired` (the gateway refuses to call it).
  - A **price** is US dollars per million tokens for input, output, cache reads and cache writes (decimal strings; an empty cache price costs what other input does), plus optional long-context rates above an input size (e.g. Claude Haiku 5.5 above 100,000 tokens). Prices are rows with `effectiveFrom`, never changed: a new price starts after the latest one, so past costs never move.
  - Anyone with a token reads it (`GET /v1/models`, Iris's model picker); platform services with `platform:manage` add models, change their status and add prices. It starts with Anthropic's current models (a migration); everything after goes through the API. OpenAI's current models were added the same way (a seed migration with the newest of each tier: GPT-6.2 Astra, GPT-6.2 Sol, GPT-6.1 Terra, GPT-6 Luna, at their standard and long-context prices).
  - Proposal, later: capabilities and regions (for Themis policy), and per-organization negotiated prices.

## Metering

Each call records:

| Field | |
|---|---|
| `organizationId`, `projectId`, `taskId`, `executionId`, `agentVersionId`, `taskTemplateVersion` | Attribution |
| `provider`, `model`, `keySource` (`agent` / `organization` / `platform`) | What was used and who pays the provider |
| `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens` | Usage, as reported by the provider; input includes cache reads and writes |
| `costUsd`, `priceId` | Cost at the price in force when the run resolved its model |
| `purpose` | `agent`, `judge`, `planning`, … |

- Prices come from the model catalogue and are **versioned**: a price change never rewrites past costs.
- Sandbox compute is metered too (seconds × sandbox size), so a task's cost is model calls plus compute.
- Usage rolls up per execution, task, task tree, automation, agent version, project and organization; Iris shows it at each level, and Kriterion uses cost per agent version alongside quality.
- Proposal: with BYOK, cost is shown for information only (the organization pays its provider directly); with platform keys, the same records are the basis for billing.

## Budgets

**Built so far** (Pylon, and Hephaestus's runner, which pauses and resumes tasks), with these differences from the design below:

- **Where they're set:** an organization's, a project's and an agent's monthly budget through `PUT /v1/organizations/{id}/budget` (`org:manage`), `…/projects/{id}/budget` (`project:manage`) and `…/agents/{id}/budget` (`org:manage`; read with `agent:read`); a task tree's on its top-level task, when it's created (`budgetUsd`) or later (`PUT …/tasks/{taskId}/budget`, `task:create`, through any task of the tree). Not yet: `maxCostUsd` on templates and automations, the project maximum and the project default; a tree without a budget has no tree limit.
- **Checked after each call, without reservations:** what a scope spent is summed from the calls the gateway recorded; the runner checks before an execution starts, and after each model call (a run whose budget ran out makes no further call). Calls already in flight can overshoot by at most one call per running execution of that scope. Reservations need each call's maximum cost up front, which the gateway can't know for input; they can replace this check later without changing anything else.
- **Pausing doesn't save the run's state yet:** the execution ends `paused`, its pending artifacts become `partial` and the task resumes in a new execution, as revision runs do today. Saving the agent's state across waits (Tasks: Sandboxes across long waits) will apply here too.
- **Windows:** calendar months in UTC; a task tree's over its life. `budget.threshold-reached` at 80%, once per window (again after the limit changes). Each runner round resumes paused tasks whose budgets have room (raised, or a new month).
- **An agent's budget** counts its calls in every project, whichever version made them (`model_calls.agent_id`). It's set by the organization's owners and admins rather than whoever edits the agent, since it caps the organization's spending, as keys do. Checked narrowest first: task tree, agent, project, organization; the one that ran out is the `pausedFor` named on the task.
- Iris shows and sets them: the organization's budget page (with each project's and agent's spend), an agent's on its page, a project's on its page, a tree's on its tasks' pages (a paused task says which budget ran out), and a budget when creating a task.
- Not yet: `pausedTimeoutDays`. Kerykes tells the organization's admins when a budget reaches its threshold (Pylon's `budget.threshold-reached`) and when a task pauses.

| Budget | Set on | Window | Default |
|---|---|---|---|
| Task tree | Template or automation (`maxCostUsd`), capped by a project maximum | The tree's lifetime | Project default |
| Agent | Agent setting | Calendar month | None |
| Project | Project setting | Calendar month | None |
| Organization | Organization setting, or the plan | Calendar month | Plan |

Enforcement:

- **Before each call**, the gateway reserves the call's maximum possible cost (its `max_tokens`, lowered to what the remaining budget allows) against every budget that applies. If a budget can't cover even a small call, the call is refused. Overshoot is therefore at most one call's rounding.
- Reservations are atomic (a counter per budget, in Hephaestus's Postgres to start with) and released when the actual usage is known.
- **Soft limit:** at 80% (configurable), `budget.threshold-reached` is published and the project's admins are notified.
- **Hard limit: tasks pause.** When a call is refused for budget, the execution saves its state (as when waiting for review: branch pushed, agent state stored), gives up its sandbox, and the task goes to `paused` with the budget that ran out. Nothing is lost and no artifact becomes `partial`.
  - task tree budget → that tree's running tasks pause; a person with `task:create` raises the tree's budget (up to the project maximum) to resume them;
  - agent, project or organization budget → every running task under it pauses at its next call, and queued tasks don't start; they resume when an admin raises the budget, or automatically when the next budget window (month) starts.
- **Resuming** puts paused tasks back in `queued`, so they restart through the normal concurrency and fair-queueing rules.
- `task.paused` is published, and the project's admins are notified, so a paused tree doesn't go unnoticed.
- Proposal: a project setting `pausedTimeoutDays` (default 14) after which a paused task fails with `budget_exceeded`, so trees don't stay paused forever.

## Observability

- Every call is an LLM span in Langfuse (prompt, completion, tool calls, usage, cost) and a span in the task's trace in Jaeger (without prompt content).
- Prompts and completions can hold secrets and personal data: redaction applies before export (see `../CLAUDE.md`).

## Open questions

None at the moment.
