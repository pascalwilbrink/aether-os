# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Aether-os

Aether-os is a platform for building, running and supporting AI agents. This folder is a single git repository and pnpm workspace (a monorepo). Each component lives in its own subdirectory with its own `package.json`, tooling and `CLAUDE.md`; read that file before working inside a component.

| Component | Owns | Location | Status |
|---|---|---|---|
| **Pistis** | Authentication: an OIDC provider that federates external identity providers (e.g. Entra ID, Auth0); user identity, service accounts, API keys, and the tokens other services verify | `pistis/` | Active: users, linked identities, password and external OIDC sign-in, service accounts and API keys; user, platform service and task tokens (token exchange) |
| **Polis** | Tenancy: organizations, projects, and memberships (which user belongs to which organization, with what role) | `polis/` | Active |
| **Agora** | Agent management: agent definitions and their immutable versions | not created yet | Planned |
| **Themis** | Policies: versioned Rego policy sets per organization/project, served to OPA as bundles ([APS](https://agentpolicyspecification.github.io)) | not created yet | Planned |
| **Kairos** | Automations: a trigger (e.g. an incoming GitHub issue) bound to an agent | not created yet | Planned |
| **Proxenos** | Connections to external systems: the GitHub App and its installations, repository ↔ project links, provider tokens, verified webhooks turned into events; later Slack, Jira and others | not created yet | Planned |
| **Kerykes** | Notifications: turns events that need people (reviews waiting, failures, paused work, budgets) into in-app, email and Slack / Teams messages (chat via Proxenos), with per-user preferences | not created yet | Planned |
| **Hephaestus** | Task management and execution: runs tasks with an agent, in sandboxed workspaces | `hephaestus/` | Active, being reshaped |
| **Loculus** | Object storage: S3-compatible, issues signed URLs | not in this folder | Separate service |
| **Krepis** | `@aether-os/krepis`: shared foundation library for the NestJS services (token verification and permissions, errors, events, transactions, pagination, HTTP helpers, shared IDs) | `krepis/` | Active |
| **OpenBao** | Secrets and credentials (LLM provider keys, repository tokens, tool and integration credentials) | infrastructure | Planned |
| **RabbitMQ** | Event bus between services | infrastructure | Planned |
| **OpenTelemetry + Jaeger + Langfuse + Loki** | Observability: OTLP from every service; service traces in Jaeger, LLM traces in Langfuse, logs in Loki, browsed in Grafana | infrastructure | Planned |
| **Seshat** | MCP server for RAG and long-term memory | not in this folder | Separate service |
| **Kriterion** | Eval framework for measuring agent quality | not in this folder | Separate |
| **Iris** | Web frontend for operating Aether-os (Next.js) | `iris/` | Active: sign-in through Pistis, choosing and creating organizations |

The names come from Greek, Egyptian and Roman antiquity: Pistis is trust and good faith; the polis is the city-state and the agora its gathering place; Kairos is the god of the opportune moment; Themis the goddess of law and order; Hephaestus the smith who does the work; Seshat the goddess of writing and record-keeping; *kritērion* is "a standard for judging"; Iris the messenger between gods and mortals; a *proxenos* was the citizen who represented a foreign city and looked after its visitors; the *kērykes* were the heralds who carried announcements; a *loculus* (Latin) is a small compartment or niche; the *krepis* is the stepped platform a Greek temple stands on.

## How the pieces fit

1. **Pistis** authenticates users and services. It is itself an OIDC provider and can federate external identity providers (Entra ID, Auth0 and others) for sign-in, but it is always the only token issuer: other services trust Pistis tokens and never an external provider's tokens directly. Users are identified by their Pistis `sub`, with external identities linked to it by provider and external subject, never by email address alone. Other services verify the tokens it issues (Krepis's `AuthModule`) and take the acting principal from them (`createdBy`, and the `actor` of events). When issuing a token, Pistis asks Polis for the user's memberships and includes them as claims (organization and role), so services check "may this user act in this organization" from the token instead of calling Polis on every request.
2. **Polis** is the tenant root and owns memberships. Every other service stores `organizationId` / `projectId` and resolves them in Polis; writes are rejected while an organization is suspended. Because token claims can be stale until the token expires, Polis should publish changes such as an organization being suspended or a membership being revoked, so services can react before then.
3. In **Agora** you define an agent and its versions (instructions, model, tools, skills, capabilities, runtime config). A version moves draft → published → deprecated, and only one version per agent is published at a time.
4. In **Themis** you write policies (Rego) and group them into versioned policy sets, scoped to an organization or project. An agent version references a policy set version.
5. In **Kairos** you create an automation that binds a trigger to an agent. Triggers from external systems arrive through **Proxenos**, which owns the connections (e.g. the GitHub App), verifies webhooks and publishes them as events; it also mints the short-lived repository tokens Hephaestus uses (see `docs/git.md`).
6. When a trigger fires, a task is created in **Hephaestus**, which runs it with the agent, provisioning a workspace when the runtime needs a sandbox. Hephaestus uses **[Mastra](https://mastra.ai)** as its agent runtime and sandbox layer: it turns the pinned agent version into a Mastra `Agent` (instructions, model, tools, skills) running against a Mastra workspace whose sandbox is the task's workspace (`@mastra/docker` locally, a microVM-backed provider such as Docker Cloud Sandboxes, E2B or Daytona in production). Hephaestus stays the source of truth for task and workspace state; Mastra sits behind ports in Hephaestus's domain layer (a runtime port and a `SandboxProvisioner` port) so it can be upgraded or swapped in one place. Sandboxes must be hardened: drop all capabilities, read-only root filesystem, PID limit, non-root user, egress only through an allowlisting proxy for `restricted` network access, and secrets delivered as short-lived files rather than container environment variables. Hephaestus enforces policy with the [Agent Policy Specification](https://agentpolicyspecification.github.io) TypeScript SDK (which has a Mastra integration): every LLM input, tool call and output goes through an `ApsEngine` backed by an OPA server (sidecar) that pulls its bundles from Themis. Evaluation fails closed (`on_error: "deny"`): if OPA is unreachable, the agent stops. APS is a draft spec with pre-release SDKs, so keep it behind a thin layer in Hephaestus.
7. Secrets live in **OpenBao** (the open-source Vault fork), never in service databases, agent configuration or the agent's context. Store them per organization and project (e.g. `orgs/{organizationId}/projects/{projectId}/...`) and reference them by path. Hephaestus fetches what a task needs when the task starts and injects it into the runtime or sandbox. Prefer short-lived, dynamically issued credentials where the backend supports it.
8. Files (task inputs and outputs, artifacts, uploads) live in **Loculus**. Services ask Loculus for signed URLs and pass those on rather than proxying file bytes or holding storage credentials themselves; clients such as Iris or a sandbox upload and download directly with the URL.
9. While running, agents use **Seshat** over MCP for retrieval and memory. **Kriterion** evaluates results per agent version.
10. **Kerykes** tells people when something needs them (a draft to review, a failed or paused task), in Iris, by email, or in Slack / Teams through Proxenos.
11. **Iris** is the UI over all services.

Code rule: every service is structured **controller → service → TypeORM repository**, with an injected mapper per resource converting DTO ↔ entity; services inject other services, never other repositories, and a class injects at most 7 dependencies; events are local events bridged to RabbitMQ by Krepis; transactions with `typeorm-transactional`, types, Zod DTOs and HTTP clients all generated from the specs with `@hey-api/openapi-ts`, and external systems behind injected interfaces. See `docs/engineering.md`.

API rule: every HTTP API uses only `GET`, `POST`, `PUT` and `DELETE` (never `PATCH`; state changes are `POST` actions), is versioned in the path starting with `/v1`, identifies everything by UUID, returns errors as RFC 9457 problem details, and paginates with cursors. See `docs/api.md`.

Design rule: a task must record the concrete `agentVersionId` it runs (and through it the policy set version), resolved when the task is created (not "latest"), so runs are reproducible and evaluable per version. Agent versions and automations reference secrets by OpenBao path, never by value. Likewise, persist Loculus object keys, never signed URLs: URLs expire, so request a fresh one when a file is needed.

## Identity and permissions

The agreed design is in `docs/identity.md`; read it before touching authentication, roles or permissions. In short: Pistis is the only token issuer (it federates Entra ID, Auth0 and others); a token is scoped to one organization; roles exist at organization and project level and live on Polis memberships; tasks run as service accounts, never as users, using task tokens obtained through token exchange; every service enforces authentication, tenancy and `@RequirePermission` through Krepis, using one fixed role → permission table defined in Krepis.

## Tasks and artifacts

The task model is being designed in `docs/tasks.md` (documentation only for now). Agreed so far: work is modelled as **tasks and subtasks** (a subtask is a task with a parent), with `dependsOn` between tasks in the same tree; a `task_plan` artifact creates subtasks of the task that produced it; every successful task outcome is an **artifact** (text, a pull request, a file, a `task_plan` that creates new tasks and subtasks, …), with exactly one primary artifact per successful task; failed tasks can leave `partial` artifacts; artifacts that need approval start as `draft` and are only delivered once approved (reviewers approve, reject, or request changes, which yields a revised draft); tasks can be created from versioned **task templates** (organization-wide or per project; project templates can extend but not weaken organization ones) that carry a definition of done (acceptance criteria), and **verification is always part of the task**: Hephaestus checks every criterion before the task can succeed (`judge` checks through Kriterion's evaluators), and failures go back to the agent; long-lived specs are documents, kept in the project's Git repository or, without one, in Loculus, with Hephaestus and Seshat both able to hold such documents by referencing the Loculus object; retention and "delete artifacts with the task" are project-level settings.

The task lifecycle (states, executions, timeouts, cancellation, retries, concurrency) is proposed in the same document.

## Design documents

| Document | Covers | Status |
|---|---|---|
| `docs/api.md` | HTTP API conventions: only `GET`/`POST`/`PUT`/`DELETE` (never `PATCH`), `/v1` path versioning, UUIDs, problem details, cursor pagination, payload conventions | Agreed |
| `docs/engineering.md` | NestJS libraries to use, service structure (controller → service → repository, mappers), transactions, Zod DTOs and generated clients, events in code, databases and migrations, calls between services, configuration, logging (Winston → Loki), testing (Testcontainers) | Agreed |
| `docs/identity.md` | Principals, tokens, roles, permissions, enforcement | Agreed |
| `docs/tasks.md` | Tasks, subtasks, artifacts, templates, verification, documents, task lifecycle | Agreed, lifecycle proposed |
| `docs/git.md` | GitHub App, repository access, one shared branch per task tree, webhooks, untrusted input | Agreed |
| `docs/models.md` | Model gateway (inside Hephaestus), provider keys (BYOK and platform), metering, budgets (tasks pause at the limit) | Agreed |
| `docs/events.md` | Event envelope (new fields on Krepis's `DomainEvent`), conventions, catalogue of events and commands | Agreed; the catalogue grows with the services |
| `docs/notifications.md` | Kerykes: notification types, recipients, preferences, channels (email via Resend or SES), content rules, answering reviews from Slack / Teams | Agreed |

These are documentation only for now; read the relevant one before implementing anything in its area.

## Events

The envelope and the full catalogue are in `docs/events.md`.

Services communicate asynchronously over **RabbitMQ**: for example Polis announcing suspended organizations and revoked memberships, Kairos triggers creating Hephaestus tasks, task status updates for Iris, and Kriterion reacting to finished tasks.

- Each service publishes its domain events to its own topic exchange (e.g. `polis.events`) with routing keys like `organization.suspended`. Each consuming service binds its own durable queue to the keys it cares about.
- **Service code never depends on RabbitMQ.** Services emit and handle local events (`@nestjs/event-emitter`); a messaging module in Krepis writes published ones to the outbox and turns incoming messages into local events (see `docs/engineering.md`).
- Publish through a transactional outbox: write the event in the same database transaction as the state change, and have a relay publish it. This keeps an event from being lost, or from being sent for a change that was rolled back.
- Consumers must be idempotent, because delivery is at-least-once. Deduplicate on `eventId` (see `DomainEvent` in `core`).
- Starting a task in Hephaestus is supported two ways, both going through the same application service:
  - **Internal callers** (e.g. Kairos) send a create-task command over RabbitMQ, so triggers survive Hephaestus being down.
  - **Third parties** use the Hephaestus HTTP API, which returns the task ID and validation errors immediately.

  Both paths need an idempotency key (the message's ID, or an `Idempotency-Key` header), so a redelivered message or a retried request never starts the same task twice.
- Event payloads are contracts like the HTTP APIs: describe them in `contracts/` (AsyncAPI) and generate types from them.

## Observability

- Every service is instrumented with OpenTelemetry and exports over OTLP to an OpenTelemetry Collector, which routes the data onwards: all traces to **Jaeger** (service-level view: HTTP calls, RabbitMQ hops, database queries, latency), and LLM spans additionally to Langfuse.
- LLM-specific traces (prompts, completions, tool calls, token usage, cost) go to **Langfuse**, which accepts OTLP. APS policy decisions are recorded there too, through the SDK's OpenTelemetry or Langfuse audit handler.
- Trace context must cross service boundaries: over HTTP via the standard `traceparent` header, and over RabbitMQ by copying it into message headers when publishing and restoring it when consuming. A task triggered by a GitHub issue then shows up as one trace from Kairos through Hephaestus.
- Put the task ID, organization ID, agent version ID and policy set version on spans, so traces can be filtered per tenant and per version (which is also what Kriterion needs).
- Traces contain prompts and tool arguments, so they can contain secrets and personal data. Redact before export (APS `redact` decisions, plus Collector processors), and never put secret values in span attributes.

## Current state vs. target

The code doesn't match the model yet:

- Hephaestus still contains `libs/agents` (agents and versions); that belongs in Agora once Agora exists.
- Hephaestus has tasks (`libs/tasks`: the model, API and lifecycle) and a runner (`libs/runner`: executions, the queue with concurrency limits, heartbeats, timeouts, cancellation, retries), with a Mastra agent runtime (`AGENT_RUNTIME=mastra`) whose model calls go through the model gateway (`libs/models`: provider keys from OpenBao, every call metered; `docs/models.md`). Agent versions that need a sandbox get one per execution, recorded as a workspace: a hardened Docker container (`SANDBOX_DRIVER=docker`; no network yet, since the allowlisting proxy doesn't exist) with Mastra's shell tools on it. Not yet: configured tools and skills, file tools, repositories in sandboxes, microVM sandboxes, policy (APS), budgets and Langfuse traces. Artifacts, templates and verification are still to come (`docs/tasks.md`).

Organizations and projects live in Polis only: Hephaestus keeps their status from Polis's events (`hephaestus/libs/tenancy`). Add organization and project features to Polis.

## Working across components

### Workspace

The root `pnpm-workspace.yaml` lists the packages: `contracts` (`@aether-os/contracts`), `krepis` (`@aether-os/krepis`), `polis`, `hephaestus`, `pistis` and `iris`. There is one lockfile, at the root; always run `pnpm install` from the root. Add new services to `pnpm-workspace.yaml`.

```bash
pnpm install               # whole workspace
pnpm build                 # every package, in dependency order (Krepis first)
pnpm lint | test | test:e2e | generate:api    # across all packages
pnpm --filter polis test   # one package (or run pnpm inside its directory)
pnpm format:check          # prettier, as CI runs it (`pnpm format` in a package fixes it)
```

`test:e2e` needs Docker (Krepis, Polis, Hephaestus, Pistis): Testcontainers starts `postgres:17.5-alpine` and `rabbitmq:4.1-management` per run. Where Docker Hub can't be reached for Testcontainers' Ryuk image, run with `TESTCONTAINERS_RYUK_DISABLED=true`.

**CI** (`.github/workflows/ci.yml`, on pushes to `main` and on pull requests) runs, in order: `pnpm install --frozen-lockfile`, `pnpm generate:api` (fails if the generated files differ from what's committed), `format:check`, `lint`, `build`, `test` and `test:e2e`. Each step only covers the packages changed since the base commit (the pull request's merge base, or the previous `main` commit) plus the packages that depend on them, so a Krepis change also checks Polis and Hephaestus, a `contracts` change checks every consumer, and changes only to `docs/` or `infra/` check nothing. Changes to the lockfile, `pnpm-workspace.yaml`, the root `package.json` or `.github/` check everything (see `.github/scripts/affected-filter.sh`). Run the same locally before pushing.

- **Packages stay publishable.** The workspace is set up so moving to a package registry later is cheap: packages depend on each other with `workspace:*` (which `pnpm publish` rewrites to real versions), import only from each other's published entry points (never another package's `src/`, no TypeScript path aliases across packages), and `contracts` is consumed as a package (`node_modules/@aether-os/contracts/...`) rather than by relative path.
- **Contracts:** `contracts/` holds the API specs (`polis.openapi.yaml`, `hephaestus.openapi.yaml`), one per service. Each spec is the source of truth for that service's HTTP API, including its validation: services generate Zod schemas from it and validate with `nestjs-zod`'s `ZodValidationPipe` (target; see `docs/engineering.md`). Edit the spec first, then run `pnpm generate:api` (root, or in the service and each consumer; currently Iris consumes Hephaestus) and commit the regenerated files. See `contracts/README.md`.
- **Krepis:** shared NestJS code goes in `krepis/`, never copied between services. Consumers depend on it with `workspace:*` plus `dependenciesMeta.injected`, so pnpm copies it into each consumer and its peer dependencies (Nest, TypeORM, Zod, …) resolve to the consumer's own copies. `pnpm-workspace.yaml` sets `dedupeInjectedDeps: false`, without which pnpm 10 silently symlinks Krepis instead whenever it can, and Krepis then resolves its peers from its own `node_modules` (two TypeORM copies, broken DI). `syncInjectedDepsAfterScripts` refreshes the copies whenever Krepis's `build` script runs. See `krepis/CLAUDE.md`.

## Local development

`docker-compose.yml` at this root runs the shared infrastructure; the app services run outside it with `pnpm` from their own directories.

```bash
docker compose up -d       # Postgres, RabbitMQ, OpenBao, OPA, OTel Collector, Jaeger, Langfuse, Loki, Grafana, Mailpit
docker compose down -v     # stop and wipe all data
```

| What | Where |
|---|---|
| Iris / Polis / Hephaestus / Pistis | `localhost:3000` / `3001` / `3002` / `3003` (each app's default `PORT`) |
| Postgres | `localhost:5432`, user `aether` / `aether`, one database per service (`infra/postgres/init/`) |
| RabbitMQ | AMQP `localhost:5672`, UI `localhost:15672`, `aether` / `aether` |
| OpenBao | `localhost:8200`, root token `dev-root-token` (dev mode: in-memory, wiped on restart) |
| OPA | `localhost:8181` |
| OTLP | `localhost:4317` (gRPC), `localhost:4318` (HTTP) → Collector (`infra/otel-collector/config.yaml`) → traces to Jaeger and Langfuse, logs to Loki |
| Jaeger UI | `localhost:16686` |
| Langfuse UI | `localhost:3100`, login `dev@aether-os.local` / `aether-dev`, API keys `pk-lf-local` / `sk-lf-local` |
| Mailpit | SMTP `localhost:1025` (any credentials), UI `localhost:8025`: catches all local email; production uses Resend or SES |
| Grafana | `localhost:3300` (no login locally): logs from Loki, linked to traces in Jaeger |

All credentials are fixed local-only values. MinIO in the compose file is only Langfuse's storage, not a stand-in for Loculus. Polis, Hephaestus and Pistis run on their own Postgres databases with migrations (`cd polis && cp .env.example .env && pnpm start:dev`, likewise in `hephaestus`); there's no SQLite left.
