# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Pylon

Pylon is Aether-os's **model gateway** (`../docs/pylon.md`, `../docs/models.md`); a *pylōn* was the monumental gateway of a Greek or Egyptian temple. Every model call and embedding goes through it. It owns:

- the **model catalogue** (models and their versioned prices);
- the **provider keys** (an agent's, an organization's, the platform's, kept in OpenBao);
- **metering** (every call, priced);
- **budgets** (an organization's, a project's and an agent's per month, a task tree's over its life).

Callers keep their providers' SDKs: Pylon passes each provider's own API through. Nothing else holds a provider key.

Status: the service is built (step 1 of `../docs/pylon.md`, Moving there); Hephaestus, Agora, Iris and Kerykes still use Hephaestus's own gateway until step 2. Planned: policy (Themis), fair sharing of platform keys' rate limits, the GenAI span attributes.

It follows `../docs/engineering.md` like Seshat: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, `typeorm-transactional`, Postgres with migrations, tests against Postgres and RabbitMQ in containers.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres, RabbitMQ and OpenBao
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3011)
pnpm build
pnpm lint
pnpm format
pnpm generate:api              # libs/core/src/api/generated (Pylon's spec), clients/polis (generated client), events/generated (Agora's and Pylon's AsyncAPI)

pnpm migration:run             # on dist/: build first
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts
HEPHAESTUS_DATABASE_URL=postgres://aether:aether@localhost:5432/hephaestus pnpm import:hephaestus   # once, after migration:run

pnpm test                      # unit tests: SSE parsing, usage meters, provider routes, the provider client, costs, budget windows, key settings, configuration
pnpm test:e2e                  # test/*.e2e-spec.ts against Postgres and RabbitMQ, with fake providers; needs Docker
```

On a Postgres volume made before Pylon, create its database once from `../`: `docker compose exec postgres createdb -U aether pylon`.

## Configuration

Validated at startup (`libs/core/src/config/env.ts`, `pylonConfigModule()`); locally from `.env`.

- `DATABASE_URL`, `RABBITMQ_URL`, `OUTBOX_RELAY_INTERVAL_MS` (1000), `PORT` (3011).
- `PISTIS_ISSUER` (plus `PISTIS_JWKS` in tests). `PISTIS_CLIENT_ID` (`pylon`) and `PISTIS_CLIENT_SECRET`: Pylon's own client at Pistis, client credentials with `platform:read`; outside production Pistis registers `pylon` / `pylon-dev-secret`. It's used for Pylon's calls to Polis (`POLIS_URL`).
- **OpenBao:** `OPENBAO_ADDR`, `OPENBAO_TOKEN`, `OPENBAO_KV_MOUNT` (`secret`). Without them no key can be set or used, which is logged at startup.
- **Keys:** `PLATFORM_MODEL_KEYS` (false): whether organizations without their own key may use the platform's.
- **Model endpoints:** `MODEL_ENDPOINT_ALLOW_PRIVATE` (false): whether an Ollama server may be on a private or loopback address and over `http://`. It's true in `.env.example` and tests.
- **Providers:**
  - `ANTHROPIC_API_URL`, `OPENAI_API_URL`, `MISTRAL_API_URL`, `GOOGLE_API_URL`: the providers' public APIs by default.
  - `PROVIDER_RETRIES` (2), `PROVIDER_TIMEOUT_MS` (10 minutes for a whole call).
  - `PROVIDER_MAX_REQUEST_BYTES` (20 MiB): the JSON body limit for every route (`configurePylonApp`).

## Architecture

Same layout as Seshat (`../seshat/CLAUDE.md`): `src/` is the app shell, and code lives in libraries under `libs/`, aliased `@pylon/<name>`. Dependency graph: `core` ← `tenancy`, `agents`, `catalog` ← `keys` ← `usage` ← `gateway`. Every entity is listed in `src/database/entities.ts`.

- **`core`:**
  - configuration and the database;
  - Krepis, re-exported;
  - Pylon's API types and Zod schemas (`../contracts/pylon.openapi.yaml`);
  - the generated Polis client;
  - the event types: `PylonEvents` from `../contracts/pylon.asyncapi.yaml`, and `AgoraEvents`;
  - `SecretsModule` (OpenBao);
  - `configurePylonApp`: Krepis's `configureHttpApp` plus the body limit, used in `server.ts` and the tests.
- **`tenancy`:** `TenancyService` asks Polis, with Pylon's own token, before writes: setting keys and budgets. Model calls don't ask it.
- **`agents`:** Pylon's copy of Agora's agents, from `agora.events`.
  - It consumes `agent.created` and `agent.archived` (`AGORA_SUBSCRIPTIONS` in `app.module.ts`; queue `pylon.agora-events`).
  - Changes are version-guarded like Hephaestus's copy. An event about an agent Pylon hasn't seen is retried.
  - `AgentsService.assertExists` scopes agents' keys and budgets.
- **`catalog`** (`ModelCatalogService`, `models` and `model_prices`):
  - As in Hephaestus, plus `kind`: `chat` or `embedding`.
  - `GET /v1/models` takes `?status=`, `?provider=`, `?model=` (Agora's check) and `?kind=`, for any token. Changing the catalogue takes `platform:manage`.
  - `entryFor(provider, model, at)` gives the gateway the model's kind, status and price. `costOf` (`model-cost.ts`) prices a call in exact millionths.
  - Errors: `ModelRetiredError` and `ModelKeyMissingError` are `409`s here (`MODEL_RETIRED`, `MODEL_KEY_MISSING`).
  - Migrations seed Anthropic's and OpenAI's chat models, and OpenAI's embedding models.
- **`keys`:**
  - **API:** `ModelKeysService` serves `…/model-keys` and `…/agents/{agentId}/model-keys`. Reading takes `org:read` / `agent:read`, writing `org:secret:write`.
  - **Storage:** the settings go to OpenBao, and a `model_keys` row records the provider, a hint and who set it. A failed write stores nothing (`503`, saying why).
  - **Ollama:** `OllamaModelsService` serves `…/ollama/models`.
  - **Picking a key:** `ProviderKeys.keyFor(organizationId, provider, agentId)` reads OpenBao on every call: the agent's key first, then the organization's, then the platform's when `PLATFORM_MODEL_KEYS` is on. An Ollama `baseUrl` is checked again every time (`checkModelKeySettings`, Krepis's `endpointProblem`).
- **`usage`:**
  - **Metering** (`ModelCallsService`, `model_calls`): one row per call.
    - Attribution: organization, project, task, task tree, agent, agent version, execution, `caller` (the token's `sub`), `purpose`.
    - What it used: `kind`, provider and model, `keySource`, tokens (input with cache reads and writes included), `costUsd` and `priceId`, `finishReason`.
    - `spent` sums a budget's calls; `usage` serves `GET /v1/organizations/{id}/usage`, with filters and `groupBy`, for `org:read` or `platform:read`.
  - **Budgets** (`BudgetsService`, `budgets`): one row per scope (`organization`, `project`, `agent`, `task_tree`).
    - Spending is summed from `model_calls`: per month in UTC, or over a task tree's life.
    - `set` asks Polis first, and publishes `budget.changed` when the limit changes.
    - `exhausted(context)` names the narrowest budget that ran out, among those the context names (a context without a tree or agent skips those).
    - `afterCall` publishes `budget.threshold-reached` at 80% and `budget.exhausted`, each once per window (`thresholdWindow`, `exhaustedWindow`).
  - **Budget routes** (`BudgetsController`):
    - `…/budget` on organizations (`org:read` / `org:manage`), projects (`project:read` / `project:manage`) and agents (`agent:read` / `org:manage`; the agent must be in the copy).
    - `…/projects/{projectId}/task-trees/{taskTreeId}/budget`: `task:read` or `platform:read` to read, `task:create` to set. Hephaestus checks the tree and passes the caller's token on.
    - `POST …/budget-checks` (`platform:read`): Hephaestus, before an execution starts or resumes.
- **`gateway`:**
  - **`ModelGateway`:** `prepare` checks the model's kind and status, then the budgets, then picks the key:
    - a budget that ran out is `402 BUDGET_EXHAUSTED` with `budget: { scope, scopeId }` (Krepis's `ProblemException`);
    - OpenBao down is `503`;
    - an Ollama server Pylon won't call is `502 PROVIDER_UNAVAILABLE`.
    
    `finish` records the call and checks thresholds; it never throws.
  - **`PassThroughService` and `ProvidersController`** (`POST /v1/providers/:provider/*path`, `@Authenticated`):
    - Only a task token with `model:invoke` in its project may call (`taskCallContext`). `X-Aether-Execution-Id` and `X-Aether-Purpose` are labels only.
    - `ProviderKeyHeaders`, a middleware on these routes, moves the token from `x-api-key` / `x-goog-api-key` to `Authorization`.
    - `providerCall` (`provider-apis.ts`) recognises the allowed routes and reads the model and `stream`. For OpenAI and Ollama streams it adds `stream_options.include_usage`.
    - `upstreamRequest` puts the key where the provider wants it and forwards only the provider's own headers.
    - `ProviderClient` sends the request. It retries on `429`, `5xx` or no answer before anything reaches the caller, and uses `guardedFetch` for Ollama.
    - The answer streams back as it comes, while `usageMeter(format)` reads the usage (`usage-meters.ts`: Anthropic's cache adds to the input, Gemini's thoughts to the output) from the JSON body or each SSE event (`SseParser`).
    - The call is recorded before the answer ends. A caller going away aborts the provider and records `aborted`. A provider's error answer is passed back as it came and isn't recorded.
  - **`EmbeddingsService` and `EmbeddingsController`** (`POST …/projects/{projectId}/embeddings`):
    - Access: `model:invoke` in the project, or a platform service's `model:invoke` (Seshat). People are refused (`projectCallContext`).
    - Providers: OpenAI's embeddings API, from `openai`, `mistral` and `ollama`.
    - The vectors come back in input order.
    - A provider's refusal is `502 PROVIDER_REFUSED`.
- **Import** (`src/database/import-from-hephaestus.ts`, `pnpm import:hephaestus`): one transaction, the same IDs, safe to run again.
  - It copies Hephaestus's agents, catalogue (replacing the models Pylon seeded, so imported calls keep their price), key records, budgets and calls (`top_level_task_id` becomes `task_tree_id`; `caller` is `hephaestus`, `purpose` is `agent`).
  - Keys stay in OpenBao at the same paths.

## Tests

`test/app.ts` builds the whole app (`createApp`, through `configurePylonApp`, waiting for the event consumer) with these in place of the real ones:
- `test/fake-polis.ts` for Polis;
- `test/fake-secrets.ts` for OpenBao (`down` makes it fail).

`test/setup.ts` starts `test/fake-providers.ts`: Anthropic, OpenAI (Chat Completions, Responses, embeddings), Mistral, Google and an Ollama server on one local port. Each answers with fixed usage, streams when asked, can be scripted (`script`) and records what it received. All `*_API_URL` point at it.

Tokens and helpers:
- `asMember`, `asTask` / `taskToken`: a task token with `task_tree_id` and optionally an agent;
- `asPlatform`: a platform service's own token;
- `agoraAgent`: delivers `agent.created` through the inbox.

`test/outbox.ts` reads the published events. `test/global-setup.ts` applies the migrations (so the seeded catalogue is there) and fails if the entities differ. Every test empties the other tables (`test/database.ts`).
