# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Kerykes

Kerykes is the Aether-os service for **notifications** (see `../CLAUDE.md` and `../docs/notifications.md`); the *kērykes* were the heralds of ancient Greece. It consumes other services' events that need people (drafts waiting for review, failed and paused tasks, budgets nearly used, new memberships), decides who is told, keeps each user's **inbox** per organization, and sends **email**. Planned: the inbox in Iris, preferences (per type and channel, digests), watchers, Slack and Teams through Proxenos (with answering reviews from chat), Resend and SES adapters, bounce handling and rate limits.

It follows `../docs/engineering.md` like Kairos: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, `typeorm-transactional`, Postgres with migrations, tests against Postgres and RabbitMQ in containers.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres, RabbitMQ and Mailpit
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3006)
pnpm build
pnpm lint
pnpm format
pnpm generate:api              # libs/core/src/api/generated (Kerykes's spec), clients/polis and clients/pistis/generated, events/generated (Polis's, Hephaestus's and Pylon's AsyncAPI)

pnpm migration:run             # on dist/: build first
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts

pnpm test                      # unit tests (libs/**/*.spec.ts): the rules, configuration
pnpm test:e2e                  # test/*.e2e-spec.ts against Postgres and RabbitMQ; needs Docker
```

## Configuration

Validated at startup (`libs/core/src/config/env.ts`, `kerykesConfigModule()`); locally from `.env`: `DATABASE_URL`, `RABBITMQ_URL`, `OUTBOX_RELAY_INTERVAL_MS` (1000; Kerykes publishes nothing yet), `PORT` (3006), `PISTIS_ISSUER` (and `PISTIS_JWKS` in tests), `PISTIS_CLIENT_ID` (`kerykes`) and `PISTIS_CLIENT_SECRET` (Kerykes's own client at Pistis, client credentials with `platform:read`; outside production Pistis registers `kerykes` / `kerykes-dev-secret`), for its calls to Polis (`POLIS_URL`) and Pistis (`PISTIS_URL`, the issuer's origin by default). Email: `EMAIL_DRIVER` (`none`, the default: deliveries are recorded `skipped`; `smtp`: through `SMTP_URL`, Mailpit at `smtp://localhost:1025` locally), `EMAIL_FROM`, `EMAIL_POLL_INTERVAL_MS` (5000; 0 sends nothing on its own), `EMAIL_MAX_ATTEMPTS` (5), `EMAIL_RETRY_BACKOFF_MS` (30 s, doubled per try), and `IRIS_URL` (links in emails).

## Architecture

`src/` is the app shell, code lives in libraries under `libs/`, aliased `@kerykes/<name>`. Dependency graph: `core` ← `directory` ← `memberships` ← `notifications`. Every entity is listed in `src/database/entities.ts`.

- **`core`:** configuration, database, Krepis re-exported, Kerykes's API types and Zod schemas (`../contracts/kerykes.openapi.yaml`), the generated Polis and Pistis clients, and the types of the events it consumes (`PolisEvents`, `HephaestusEvents`, `PylonEvents`).
- **`directory`:** `Directory` (abstract; `HttpDirectory` over the generated clients, Kerykes's own token, 5 s timeout, one retry, a fresh token after a 401; `DirectoryUnavailableError` otherwise): an organization's user members and a user's project grants (Polis, `platform:read`), a project's name (Polis), a user's profile and email (Pistis's `GET /v1/users/{userId}`, `platform:read`).
- **Messaging (`src/app.module.ts`):** Krepis's `EventsModule` consumes Polis's membership events (`kerykes.polis-events`: `POLIS_SUBSCRIPTIONS`), Hephaestus's `task.awaiting-review`, `task.failed`, `task.succeeded` and `task.paused` (`kerykes.hephaestus-events`) and Pylon's `budget.threshold-reached` (`kerykes.pylon-events`), through the inbox: a handler that throws (Polis or Pistis unreachable) rolls everything back and the message is retried.
- **`memberships`:** `MembershipsService`, Kerykes's copy of who belongs where (`organization_members`, `project_members`, users only): `PolisMembershipsListener` applies `membership.*` and `project-membership.*`, version-guarded on `aggregateVersion` (an older event changes nothing; a revoked membership stays as a tombstone), and `ensureSynced` reads an organization's memberships from Polis the first time it comes up (`organization_syncs`; rows at version 0, so anything an event wrote wins). Queries: a user's organization roles, their effective project role (Krepis's `effectiveProjectRole`), whether they hold a permission now, the organization's owners and admins, and a project's approvers (explicit `approver` grants still holding `task:approve`; the owners and admins when there are none).
- **`notifications`:**
  - `rules.ts` (pure, unit-tested): `planFor(event, source)` → a `NotificationPlan` or null: the type, the audience (a user, a project's approvers, the organization's admins), what recipients must hold (`requires`), the Iris link, a `groupKey`, whether to email, and the words from Aether-os's own data only (never a task title, an issue or agent output; the project's name at most). `task.awaiting-review` → approvers (`review:<task>:<round>`); `task.failed` → the requester, top-level tasks only (one per failure); `task.succeeded` → the requester, top-level only, inbox only; `task.paused` → owners and admins, once per tree, budget and day; `budget.threshold-reached` → owners and admins, once per budget and window, linking to where that budget is set; `membership.granted` / `project-membership.granted` → that user (not service accounts). A requester that isn't a member (Kairos's tasks are requested by Kairos) gets nothing.
  - `NotificationsService.notify` (`EventsListener`, in the inbox's transaction): the plan, the organization synced, the audience resolved and filtered to users holding `requires` now, the project's name from Polis, one `notifications` row per recipient (unique per organization, recipient and `groupKey`: a repeat adds nothing) and, where the plan emails, an `email_deliveries` row (`pending`, or `skipped` without email). `mayReceive` checks again before an email.
  - `InboxService` / `NotificationsController`: `/v1/organizations/{id}/notifications` (`org:read`; the caller's own, users only, else 403): list (newest first, `?unread=`), `unread-count`, `{id}/read`, `{id}/unread` (idempotent; another user's is a 404), `read-all`. Only notifications about the organization or a project the caller's token can read (`scope_id`: the project, or the organization's ID).
  - `EmailDispatcher`: every `EMAIL_POLL_INTERVAL_MS` (and `tick(now)` in tests), claims due `pending` deliveries (`FOR UPDATE SKIP LOCKED`, moving `next_attempt_at` 5 minutes on as a lease, so instances share the work), skips one whose recipient may no longer see it, isn't an active user or has no email, and sends the rest through `EmailSender` (`SmtpEmailSender` with nodemailer, or `NoEmailSender`); `emailFor` (`email-content.ts`) writes the subject, text and HTML (escaped) with one link to Iris. A failed try waits the backoff, doubled each time, until `EMAIL_MAX_ATTEMPTS` (`failed`).

## Tests

`test/global-setup.ts` starts Postgres and RabbitMQ (Testcontainers), applies the migrations and fails if the entities differ from them; `test/app.ts` builds the app with `test/fake-directory.ts` (Polis's members, grants and projects, Pistis's users; `down` makes it fail) and `test/fake-email.ts` (keeps what was sent; `failures` makes sends throw), and tokens from the run's `TestTokens`. `test/notifications.e2e-spec.ts` delivers events through the real inbox (`EventInbox.receive`) and once through RabbitMQ, reads inboxes over HTTP, and sends emails with `EmailDispatcher.tick`.
