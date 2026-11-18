# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Proxenos is the Aether-os service for connections to external systems (see `../CLAUDE.md` and `../docs/git.md`); a *proxenos* was the citizen who represented a foreign city and looked after its visitors. For now it owns the **GitHub App**: organizations **connect** it (install it on GitHub accounts), Proxenos records the **installations** and the **repositories** they cover, project admins **link** repositories to projects, running tasks get short-lived **tokens** narrowed to one linked repository, and GitHub's **webhooks** arrive verified and deduplicated. Planned: normalized GitHub events for Kairos (`github.issue.opened`, …), `git.pull-request.updated`, and Slack, Jira and others.

It follows `../docs/engineering.md` like Polis: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, `typeorm-transactional`, Postgres with migrations, events through the outbox, tests against Postgres in containers.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres, RabbitMQ and OpenBao
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3004)
pnpm build
pnpm lint
pnpm format
pnpm generate:api              # libs/core/src/api/generated (Proxenos's spec), clients/polis/generated (Polis client), events/generated (its AsyncAPI)

pnpm migration:run             # apply pending migrations (on dist/: build first)
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts

pnpm test                      # unit tests: configuration, webhook signatures
pnpm test:e2e                  # e2e (test/*.e2e-spec.ts) against Postgres and a fake GitHub; needs Docker
```

## Configuration

Validated at startup (`libs/core/src/config/env.ts`, `proxenosConfigModule()`); locally from `.env`.

- `DATABASE_URL`, `RABBITMQ_URL`, `OUTBOX_RELAY_INTERVAL_MS` (1000), `PORT` (3004), `NODE_ENV`.
- `PISTIS_ISSUER` (and `PISTIS_JWKS` in tests): whose tokens to trust. `PISTIS_CLIENT_ID` (`proxenos`) and `PISTIS_CLIENT_SECRET`: Proxenos's own client at Pistis (client credentials, `platform:read`; outside production Pistis registers `proxenos` / `proxenos-dev-secret`), for its calls to Polis (`POLIS_URL`).
- `IRIS_URL` (`http://localhost:3000`): where people go back to after connecting GitHub.
- The GitHub App: `GITHUB_APP_ID` (without it GitHub isn't configured, and connecting, syncing, tokens and webhooks answer 503), `GITHUB_APP_SLUG` (its URL name, for the installation page), `GITHUB_CLIENT_ID` (its OAuth client), `GITHUB_URL` (`https://github.com`) and `GITHUB_API_URL` (`https://api.github.com`; for GitHub Enterprise Server e.g. `https://ghe.example/api/v3`). Its secrets are **never** environment variables: they're a platform secret in OpenBao at `GITHUB_APP_SECRET_PATH` (`platform/github-app`): `{ "privateKey": "<the app's PEM key>", "clientSecret": "…", "webhookSecret": "…" }`, read with `OPENBAO_ADDR`, `OPENBAO_TOKEN`, `OPENBAO_KV_MOUNT` (`secret`; Krepis's `OpenBaoSecretStore`) and cached five minutes.

### A GitHub App for local development

Create one under your GitHub account (Settings → Developer settings → GitHub Apps):

- **Permissions** (`docs/git.md`): contents, pull requests and issues read/write; metadata and checks read. **Not** workflows.
- **"Request user authorization (OAuth) during installation"** on, and the **Callback URL** `http://localhost:3004/v1/github/setup`: after installing, GitHub sends people there with `installation_id`, the `state` and a `code` (with this option the Setup URL field is disabled). Proxenos checks with that authorization that the person can access the installation.
- **Webhook URL**: a tunnel to `http://localhost:3004/v1/webhooks/github` (GitHub can't reach localhost), with a webhook secret; events: installation, installation repositories.
- Generate a private key and a client secret, then store all three in the local OpenBao:

```bash
curl -s -X POST http://localhost:8200/v1/secret/data/platform/github-app -H 'x-vault-token: dev-root-token' \
  -d "$(jq -n --rawfile key app.private-key.pem '{data:{privateKey:$key,clientSecret:"…",webhookSecret:"…"}}')"
```

## Architecture

Same layout as Polis (`../polis/CLAUDE.md`): `src/` is the app shell (`main.ts` creates the app with `rawBody: true`, for webhook signatures), code lives in libraries under `libs/`, aliased `@proxenos/<name>`. Dependency graph: `core` ← `github`, `tenancy` ← `installations` ← `repositories`. Every entity is listed in `src/database/entities.ts` (the CLI and the tests' schema check use it).

- **`core`:** configuration, database, Krepis re-exported, Proxenos's API types and Zod schemas, the generated Polis client, and its events (`ProxenosEvents`, typed from `../contracts/proxenos.asyncapi.yaml`).
- **`github`:** the `GitHubApp` port (`configured`, `installUrl`, `userCanAccessInstallation`, `installation`, `repositories`, `createToken`, `verifyWebhook`) and `HttpGitHubApp` over GitHub's REST API (`X-GitHub-Api-Version: 2022-11-28`): as the app (an RS256 JWT, nine minutes, `iss` = app ID; GitHub's PKCS#1 keys read with `node:crypto`), as an installation (installation tokens), or as the installing person (their OAuth token, used once and dropped). `GitHubUnavailableError` and `GitHubNotConfiguredError` are 503s. `webhookSignature` / `isValidWebhookSignature`: `sha256=` HMAC, compared in constant time.
- **`tenancy`:** `TenancyService` asks Polis (`HttpPolisClient`, the generated client with Proxenos's own token) whether an organization accepts writes (404, `ORGANIZATION_SUSPENDED`) and a project too (404, `PROJECT_ARCHIVED`). No copy of their state: writes here are rare.
- **`installations`:**
  - **Connecting** (`ConnectService`, `docs/git.md` Connecting a repository): `POST /v1/organizations/{id}/github/connect` (`org:manage`, `{ returnTo? }`, a path in Iris) stores a random 256-bit `state` (only its SHA-256, `connect_requests`, 10 minutes) bound to the organization and the person, and returns the app's installation page. GitHub sends the browser to `GET /v1/github/setup` (public): the state is claimed in one statement (unused, unexpired, then used), GitHub's `code` is redeemed for the person's token, and only if their own installations include this one is it recorded, as that person (the events' actor). Every outcome is a 303 back to Iris: `?github=connected`, or `?github=failed&reason=expired|incomplete|not-allowed|not-found|installation-taken|github-unavailable`.
  - **Installations** (`InstallationsService`, `installations`): one organization each (`uq_installations_provider_external_id`; connecting another organization's is refused); `status` `active` / `suspended` / `deleted`. GitHub is asked first, outside the transaction; applying what it said (status, account, repositories) locks the row, and any change bumps `version` and publishes `git.installation-changed` (`aggregateVersion` = `version`). `GET …/installations`, `GET …/installations/{id}` (`org:read`), `POST …/installations/{id}/sync` (`org:manage`: reads GitHub again, e.g. after a missed webhook).
  - **Repositories** (`RepositoriesService`, `repositories`): what installations cover, reconciled with GitHub on every apply: new ones `available`, missing ones `removed` (kept, so links and history can name them), names and default branches updated. `GET /v1/organizations/{id}/repositories` (`org:read`, available ones by full name, `?installationId=`).
  - **Webhooks** (`WebhooksService`, `POST /v1/webhooks/github`, public): the signature first (`401` otherwise), then stored once (`webhook_deliveries`, unique on `X-GitHub-Delivery`; a redelivery is acknowledged and skipped), then handled: `installation` `deleted` / `suspend` / anything else (a sync), `installation_repositories` (a sync); other events are only stored. A handling failure is kept on the delivery (`error`) and still acknowledged (`202`): GitHub doesn't redeliver on its own, and a sync catches up. An installation no organization connected is ignored.
- **`repositories`** (links):
  - `RepositoryLinksService` (`repository_links`): `POST /v1/organizations/{id}/projects/{projectId}/repositories` (`project:manage`, `{ repositoryId }`; an available repository of an active installation, an active project; `REPOSITORY_ALREADY_LINKED`), list and read (`project:read`, with the repository), `DELETE` (`project:manage`). Events `git.repository-linked` and `git.repository-unlinked` (`reason`: `unlinked`, or `repository-removed` when the installation lost it: handled on the local `proxenos.git.installation-changed` in the same transaction).
  - `RepositoryTokensService`: `POST …/repositories/{linkId}/tokens` (`{ access: read | write }`) needs `repository:token` in the project **and** a task token (`task_id`; a person's token is refused even with the role), and an active installation (`INSTALLATION_NOT_ACTIVE`). The installation token is narrowed to that one repository and to `read` (contents, metadata) or `write` (also contents write and pull requests), never `workflows`; it lives at most an hour and is never stored. Every token is logged (task, service account, repository, access), never its value. The response has the clone URL and default branch.
- **Errors:** `DomainError`s are 409 with their `code` (add new ones to the spec's `DomainErrorCode`).

## Tests

`test/global-setup.ts` starts Postgres and RabbitMQ, applies the migrations and fails if the entities differ from them. `test/setup.ts` points the app at the run's test tokens and at `test/fake-github.ts`, a GitHub in the test process (`test/github.ts`): the OAuth code exchange, a person's installations, and the App API under `/api/v3` (Enterprise-style), checking the app's JWT against the public half of a key generated per run, recording every token request. `test/app.ts` replaces `PolisClient` with `test/fake-polis.ts` and the `SecretStore` with the app's test secrets; `asMember` and `asTask` (a task token, as Pistis exchanges it for Hephaestus) make clients. `test/outbox.ts` reads the published events.
