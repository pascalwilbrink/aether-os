# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agora

Agora is the Aether-os service for **agent management** (see `../CLAUDE.md`); the agora was the gathering place of the Greek city. It owns **agents** and their immutable, numbered **versions** (instructions, model, tools, skills, capabilities, runtime): a version moves draft → published → deprecated, and only one version of an agent is published at a time. Every change is published as an event, and Hephaestus, which runs tasks with the published versions, keeps its copy of agents and versions from them. Iris manages agents here. Planned: policy set versions on versions (Themis), quality per version (Kriterion).

Agents (and now skills, `../docs/skills.md`) used to live in Hephaestus, whose tables became its copy; `pnpm import:hephaestus` brings the agents and skills made before Agora over once, with the same IDs (run it after Agora's migrations when moving an existing installation: until then, Iris shows no agents, while Hephaestus still runs them).

It follows `../docs/engineering.md` like Kairos: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, `typeorm-transactional`, Postgres with migrations, tests against Postgres and RabbitMQ in containers.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres and RabbitMQ
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3008)
pnpm build
pnpm lint
pnpm format
pnpm generate:api              # libs/core/src/api/generated (Agora's spec), clients/polis and clients/hephaestus (generated clients), events/generated (Agora's AsyncAPI)

pnpm migration:run             # on dist/: build first
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts
HEPHAESTUS_DATABASE_URL=postgres://aether:aether@localhost:5432/hephaestus pnpm import:hephaestus   # once, after migration:run: Hephaestus's agents, skills and their versions

pnpm test                      # unit tests (libs/**/*.spec.ts): transitions, mappers, configuration, the Hephaestus client
pnpm test:e2e                  # libs/**/*.int-spec.ts and test/*.e2e-spec.ts against Postgres and RabbitMQ; needs Docker
```

On a Postgres volume made before Agora, create its database once: `docker compose exec postgres createdb -U aether agora` (from `../`).

## Configuration

Validated at startup (`libs/core/src/config/env.ts`, `agoraConfigModule()`); locally from `.env`: `DATABASE_URL`, `RABBITMQ_URL`, `OUTBOX_RELAY_INTERVAL_MS` (1000), `PORT` (3008), `PISTIS_ISSUER` (and `PISTIS_JWKS` in tests), `PISTIS_CLIENT_ID` (`agora`) and `PISTIS_CLIENT_SECRET` (Agora's own client at Pistis, client credentials with `platform:read`; outside production Pistis registers `agora` / `agora-dev-secret`), for its calls to Polis (`POLIS_URL`), Hephaestus (`HEPHAESTUS_URL`) and Pylon (`PYLON_URL`).

## Architecture

Same layout as Kairos (`../kairos/CLAUDE.md`): `src/` is the app shell, code lives in libraries under `libs/`, aliased `@agora/<name>`. Dependency graph: `core` ← `tenancy` ← `agents`, `skills`. Every entity is listed in `src/database/entities.ts`.

- **`core`:** configuration, database, Krepis re-exported, Agora's API types and Zod schemas (`../contracts/agora.openapi.yaml`), the generated Polis, Hephaestus and Pylon clients, and its events (`AgoraEvents`, `../contracts/agora.asyncapi.yaml`).
- **`tenancy`:** `TenancyService.assertOrganizationAcceptsWrites` asks Polis (with Agora's own token, `ServiceTokens`, also used for Hephaestus) before every write: 404 for an unknown organization, `ORGANIZATION_SUSPENDED`, `503` when Polis can't be reached. Reads only need the token's organization (Krepis). No copy of Polis's state.
- **Messaging (`src/app.module.ts`):** Krepis's `EventsModule` publishes Agora's events to `agora.events` through the outbox; it consumes nothing yet.
- **`agents`:** `AgentsService` owns agents, `AgentVersionsService` owns versions and reaches agents through `AgentsService`.
  - **API** (`/v1/organizations/{organizationId}/agents`, `…/{agentId}/archive`, `…/{agentId}/versions`, `…/versions/{versionId}/publish`): `agent:read`, `agent:write` (create, archive, new versions) and `agent:publish`; `createdBy` is the caller's `sub`. The same shapes Hephaestus served.
  - **Versions:** creating or publishing one calls `lockForVersionChange`, which locks the agent row (`AGENT_ARCHIVED` for an archived agent): concurrent requests for one agent take turns, so numbers are gapless and only one version is published. Publishing deprecates the previous published version in the same transaction; publishing the published version returns it unchanged; a deprecated version can't be published (`AGENT_VERSION_INVALID_TRANSITION`). Archiving is idempotent.
  - **Choices checked by Pylon and Hephaestus:** a version's model comes from Pylon's catalogue and its tools and skills from Hephaestus (the organization's tool servers and skills), so before creating one `AgentVersionChecker` asks both (`HttpAgentVersionChecker`, with Agora's own token, 5 s timeouts, a network error retried once, a refused token once with a fresh one): first `HttpModelChecker`, Pylon's `GET /v1/models?provider=&model=` (an `active` `chat` model, else `MODEL_NOT_AVAILABLE`; an Ollama model isn't asked about, the organization's server has its own), then Hephaestus's `POST /v1/organizations/{id}/agent-version-checks` with the tools and skills, whose `409` comes back as the same error here (`TOOL_SERVER_INVALID`, `SKILL_INVALID`, `AgentVersionChoiceError`). Anything else, or no answer, is `503`, and no version is created. Hephaestus never calls Agora synchronously (`../docs/engineering.md`: no calls in both directions); it learns about agents from the events.
  - **Events** (in the change's transaction): `agent.created` (the agent), `agent.archived`, `agent-version.published` (the whole version, which never changes, `previousVersionId`, and `policySetVersionId`, null until Themis) and `agent-version.deprecated` after it for the version it replaced. All have the agent as their aggregate; `version` on the agent grows by one per event and is its `aggregateVersion` (creation is 1), so a consumer can drop an older or repeated one.
- **`skills`** (`../docs/skills.md`; moved from Hephaestus): an organization's skills in the Agent Skills format. `/v1/organizations/{id}/skills`: list (by name, `?status=`) and read (`agent:read`), create with the first version (`agent:write`; `SKILL_ALREADY_EXISTS`), `archive` (idempotent; no new versions, `SKILL_ARCHIVED`), and `…/versions` (list newest first without files; create the next one, numbered under a lock on the skill; read one with its files). A version is the whole folder (at most 100 files, 1 MiB) and never changes; `checkSkillFiles` (pure, unit-tested) wants `SKILL.md` at its root naming the skill, with a one-line `description` (`SKILL_INVALID`). Writes need an active organization (Polis). **Events** in the change's transaction, the skill the aggregate and its `revision` the `aggregateVersion`: `skill.created` then `skill-version.published` (the whole version, files included) for a new skill, `skill-version.published` per version, `skill.archived`. `SkillsService.assertChoosable` (each skill once; enabled ones active with that version) is for checking agent versions here once Hephaestus keeps a copy of skills; until then Hephaestus still checks them.
- **Import (`src/database/import-from-hephaestus.ts`, `pnpm import:hephaestus`):** copies `agents` and `agent_versions`, and `skills` and `skill_versions`, from Hephaestus's database (`HEPHAESTUS_DATABASE_URL`) into Agora's, with their IDs (tasks pin version IDs), in one transaction; rows Agora has already are left alone (a skill whose name Agora has is left out with its versions), so it can run again. Imported agents start at `version` 1 and skills at `revision` 1, and publish no events (Hephaestus has them).

## Tests

`test/app.ts` builds the whole app (`createApp`) with `test/fake-polis.ts` (organizations as Polis would return them) and `test/fake-hephaestus.ts` (the check: known models, tool servers and skills, and `down`) in place of the HTTP clients, on the run's Postgres and RabbitMQ (`test/global-setup.ts` applies the migrations and fails if the entities differ from them; every test empties the tables, `test/database.ts`). Tokens come from the run's `TestTokens` (`test/tokens.ts`, `asMember`); `test/outbox.ts` reads the events written to the outbox. `test/skills.e2e-spec.ts` covers skills and their events. `http-agent-version-checker.spec.ts` runs the Hephaestus client against a local HTTP server; Hephaestus's side of the check is tested in `../hephaestus/test/agents.e2e-spec.ts`.
