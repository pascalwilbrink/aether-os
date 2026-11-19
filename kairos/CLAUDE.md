# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Kairos

Kairos is the Aether-os service for **automations** (see `../CLAUDE.md` and `../docs/automations.md`); Kairos is the god of the opportune moment. An automation binds a **trigger** (for now a GitHub issue event, from Proxenos) to the **task** an agent runs: when a matching event arrives, Kairos records a **run** and sends Hephaestus a `task.create` command over RabbitMQ, and the run follows Hephaestus's answer. Planned: other triggers (schedules, Slack, Jira), concurrency keys, a service account per automation, and automation templates (predefined `task_plan`s).

It follows `../docs/engineering.md` like Proxenos: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, `typeorm-transactional`, Postgres with migrations, tests against Postgres and RabbitMQ in containers.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres and RabbitMQ
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3005)
pnpm build
pnpm lint
pnpm format
pnpm generate:api              # libs/core/src/api/generated (Kairos's spec), clients/polis/generated, events/generated (Kairos's, Proxenos's and Hephaestus's AsyncAPI)

pnpm migration:run             # on dist/: build first
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts

pnpm test                      # unit tests (libs/**/*.spec.ts): triggers, configuration
pnpm test:e2e                  # test/*.e2e-spec.ts against Postgres and RabbitMQ; needs Docker
```

## Configuration

Validated at startup (`libs/core/src/config/env.ts`, `kairosConfigModule()`); locally from `.env`: `DATABASE_URL`, `RABBITMQ_URL`, `OUTBOX_RELAY_INTERVAL_MS` (1000), `PORT` (3005), `PISTIS_ISSUER` (and `PISTIS_JWKS` in tests), `PISTIS_CLIENT_ID` (`kairos`) and `PISTIS_CLIENT_SECRET` (Kairos's own client at Pistis, client credentials with `platform:read`; outside production Pistis registers `kairos` / `kairos-dev-secret`), for its calls to Polis (`POLIS_URL`).

## Architecture

Same layout as Proxenos (`../proxenos/CLAUDE.md`): `src/` is the app shell, code lives in libraries under `libs/`, aliased `@kairos/<name>`. Dependency graph: `core` ← `tenancy` ← `automations`. Every entity is listed in `src/database/entities.ts`.

- **`core`:** configuration, database, Krepis re-exported, Kairos's API types and Zod schemas, the generated Polis client, its own events (`KairosEvents`, `../contracts/kairos.asyncapi.yaml`) and the types of the events it consumes (`ProxenosEvents`, `HephaestusEvents`, which also holds the `task.create` command's payload).
- **`tenancy`:** `TenancyService` asks Polis (with Kairos's own token) whether a project accepts writes (404, `ORGANIZATION_SUSPENDED`, `PROJECT_ARCHIVED`), before an automation is created, changed, paused or resumed. No copy of their state.
- **Messaging (`src/app.module.ts`):** Krepis's `EventsModule` consumes Proxenos's issue events (`kairos.proxenos-events`: `PROXENOS_SUBSCRIPTIONS`) and Hephaestus's answers (`kairos.hephaestus-events`: `task.created`, `task.create-rejected`), through the inbox; publishes `automation.triggered` to `kairos.events`; and sends `task.create` to `hephaestus.commands` (`send`), both through the outbox.
- **`automations`:**
  - `AutomationsService` (`automations`): `/v1/organizations/{id}/projects/{projectId}/automations` list (`?status=`, newest first), create, read, `PUT` (replace), and `pause`, `resume` and `archive` (idempotent; an archived automation can't change, `AUTOMATION_ARCHIVED`; archiving works in a suspended organization or archived project too). `automation:read` to read, `automation:manage` to change (project admins), checked on the route. The trigger and the action are stored as JSON with their defaults filled in (`storedTrigger`, `storedAction` in `triggers.ts`); an action needs exactly one of `task` and `template`, and its texts may only use the known fields (`FIELDS`), else `400` with a pointer per problem. Agents, templates, service accounts and repository links aren't checked here: Hephaestus checks them when a run asks, and a refusal shows on the run.
  - `triggers.ts` (pure, unit-tested): `match(trigger, eventType, event, projectId)` → the project's repository link, or null. The event must be the trigger's, its repository linked to the automation's project (and the trigger's link, if any), the author's role at least `minimumPermission` (default `write`; null, `none` or below is untrusted; `any` lets anyone), not a pull request's conversation unless `includePullRequests`, not Aether-os's own bot unless `includeAetherOs` (no loops), and the `label` added (`labeled`) or carried. `render` fills in `{{issue.number}}`, `{{issue.title}}`, `{{issue.url}}`, `{{repository}}`, `{{author}}`, `{{label}}`.
  - `AutomationRunsService` (`automation_runs`): on `proxenos.github.issue.opened` / `.labeled` / `github.issue-comment.created`, each active automation of the event's organization for that event type (`activeFor`) that matches gets a run, unique per automation and source event (a redelivered or replayed event fires nothing twice), and in the same transaction a `task.create` command (`DomainEvents.send`; its `eventId`, Hephaestus's idempotency key, is the run's ID; `task` or `template` with the fields filled in, the service account, `repository.linkId` of the event's link unless `workInRepository` is off, `review.artifactKinds`) and `automation.triggered`. `hephaestus.task.created` and `task.create-rejected` whose `idempotencyKey` is a run's ID set its `status` (`created` with `taskId`, or `rejected` with `rejection`); answers about other tasks are ignored. `GET …/automations/{id}/runs` (`automation:read`) lists them, newest first.

## Tests

`test/global-setup.ts` starts Postgres and RabbitMQ (Testcontainers), applies the migrations and fails if the entities differ from them; `test/app.ts` builds the app with a fake Polis (`test/fake-polis.ts`) and tokens from the run's `TestTokens`. `test/automations.e2e-spec.ts` delivers events through the real inbox (`EventInbox.receive`) and once through RabbitMQ, and reads the outbox for the commands and events.
