# Model access and cost

How agents reach LLM providers, whose keys they use, and how usage and cost are measured and limited.

Status: agreed design. Sections marked **Proposal** are not agreed yet. Built so far (Hephaestus `libs/models`, used by the Mastra runtime): the gateway resolving an agent version's model with the organization's key, else the platform's if allowed (`PLATFORM_MODEL_KEYS`), from OpenBao; calls through Mastra's model router with retries on 429/5xx; and metering of every call (tokens, key source, attribution) in `model_calls`, totalled per execution. Not yet: policy checks, budgets and reservations, prices (cost stays null until the model catalogue), fallback models, the gateway's HTTP endpoint, and LLM spans to Langfuse.

## Decisions

| Decision | Choice |
|---|---|
| Where calls go | **Through one model gateway**, never directly from an agent or a sandbox. It lives **inside Hephaestus** (a `ModelGateway` port over Mastra's model router), with its own HTTP endpoint for callers outside the worker (Kriterion, later agents in sandboxes), so it can become its own service later without changing callers. |
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
4. picks the key: the organization's own key for that provider, else the platform key if allowed;
5. calls the provider, with retries on 429/5xx and the agent version's optional fallback models;
6. records usage and cost, emits the LLM span (to Langfuse via the Collector) and releases the unused part of the reservation.

Why a gateway instead of each component calling providers: one place for keys, budgets, metering, policy and retries; nothing else ever needs a provider key.

## Keys

| Source | Stored at | Used when |
|---|---|---|
| Organization (BYOK) | `orgs/{organizationId}/llm/{provider}` in OpenBao | Always first, if present for that provider |
| Platform | `platform/llm/{provider}` | If the organization has no key for that provider and its plan includes platform usage |

- Organizations manage their keys with `secret:write` (organization-wide); keys are write-only through the API, as with every secret.
- Proposal: a project can override with its own key (`orgs/{organizationId}/projects/{projectId}/llm/{provider}`), e.g. to bill a different provider account.
- With platform keys, the gateway also shares provider rate limits fairly between organizations (per-organization concurrency on model calls), so one tenant can't exhaust them for everyone.

## Models

- An agent version names its model (`provider/model`, e.g. `anthropic/claude-sonnet-5-5`), optional fallbacks, and default parameters. Pinned with the version, like everything else.
- Themis policy decides what's allowed: e.g. "only models hosted in the EU", "no model from provider X in this project". A denied model fails the call (closed), it is never silently replaced.
- Proposal: a platform **model catalogue** (provider, model, context window, capabilities, region, prices) that Agora uses to validate agent versions and the gateway uses for pricing.

## Metering

Each call records:

| Field | |
|---|---|
| `organizationId`, `projectId`, `taskId`, `executionId`, `agentVersionId`, `taskTemplateVersion` | Attribution |
| `provider`, `model`, `keySource` (`organization` / `platform`) | What was used and who pays the provider |
| `inputTokens`, `outputTokens`, `cachedInputTokens` | Usage, as reported by the provider |
| `costUsd`, `priceVersion` | Cost at the price in force at that moment |
| `purpose` | `agent`, `judge`, `planning`, … |

- Prices come from the model catalogue and are **versioned**: a price change never rewrites past costs.
- Sandbox compute is metered too (seconds × sandbox size), so a task's cost is model calls plus compute.
- Usage rolls up per execution, task, task tree, automation, agent version, project and organization; Iris shows it at each level, and Kriterion uses cost per agent version alongside quality.
- Proposal: with BYOK, cost is shown for information only (the organization pays its provider directly); with platform keys, the same records are the basis for billing.

## Budgets

| Budget | Set on | Window | Default |
|---|---|---|---|
| Task tree | Template or automation (`maxCostUsd`), capped by a project maximum | The tree's lifetime | Project default |
| Project | Project setting | Calendar month | None |
| Organization | Organization setting, or the plan | Calendar month | Plan |

Enforcement:

- **Before each call**, the gateway reserves the call's maximum possible cost (its `max_tokens`, lowered to what the remaining budget allows) against every budget that applies. If a budget can't cover even a small call, the call is refused. Overshoot is therefore at most one call's rounding.
- Reservations are atomic (a counter per budget, in Hephaestus's Postgres to start with) and released when the actual usage is known.
- **Soft limit:** at 80% (configurable), `budget.threshold-reached` is published and the project's admins are notified.
- **Hard limit: tasks pause.** When a call is refused for budget, the execution saves its state (as when waiting for review: branch pushed, agent state stored), gives up its sandbox, and the task goes to `paused` with the budget that ran out. Nothing is lost and no artifact becomes `partial`.
  - task tree budget → that tree's running tasks pause; a person with `task:create` raises the tree's budget (up to the project maximum) to resume them;
  - project or organization budget → every running task under it pauses at its next call, and queued tasks don't start; they resume when an admin raises the budget, or automatically when the next budget window (month) starts.
- **Resuming** puts paused tasks back in `queued`, so they restart through the normal concurrency and fair-queueing rules.
- `task.paused` is published, and the project's admins are notified, so a paused tree doesn't go unnoticed.
- Proposal: a project setting `pausedTimeoutDays` (default 14) after which a paused task fails with `budget_exceeded`, so trees don't stay paused forever.

## Observability

- Every call is an LLM span in Langfuse (prompt, completion, tool calls, usage, cost) and a span in the task's trace in Jaeger (without prompt content).
- Prompts and completions can hold secrets and personal data: redaction applies before export (see `../CLAUDE.md`).

## Open questions

None at the moment.
