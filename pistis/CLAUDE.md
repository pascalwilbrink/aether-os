# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Pistis is the authentication service of Aether-os (see `../CLAUDE.md` and `../docs/identity.md`): an OpenID Connect provider that federates external identity providers and is the **only** token issuer. Other services trust Pistis tokens, never an upstream provider's.

Built so far: **users** and their **linked identities** (`user_providers`). Planned next: token issuing with `oidc-provider` (signing keys, JWKS, organization-scoped tokens with roles from Polis's memberships), then verification and `@RequirePermission` in Krepis. Service accounts, platform services and token exchange come after.

It follows `../docs/engineering.md` like Polis: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, `typeorm-transactional`, Postgres with migrations, tests against Postgres in containers.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3003)
pnpm build
pnpm lint
pnpm format
pnpm generate:api              # regenerate libs/core/src/api/generated from ../contracts/pistis.openapi.yaml

pnpm migration:run             # apply pending migrations (on dist/: build first)
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts

pnpm test                      # unit tests (libs/**/*.spec.ts): transitions, mappers, config
pnpm test:e2e                  # integration (libs/**/*.int-spec.ts) and e2e (test/*.e2e-spec.ts) against Postgres; needs Docker
```

## Configuration

Environment variables, validated at startup with the Zod schema in `libs/core/src/config/env.ts` (`pistisConfigModule()`): `DATABASE_URL` (required, Postgres), `PORT` (3003), `NODE_ENV`. Locally from `.env` (`.env.example` has the `docker compose` defaults).

## Users and identities

- **`users`**: a person as Pistis knows them. `id` (UUIDv7) is their `sub` in every token. `displayName`, `email` (contact only), `status` (`active` / `disabled`; disabled users can't sign in through any identity), `lastSignInAt`.
- **`user_providers`**: an external identity linked to a user: `(provider, subject)`, unique across all users. `provider` is the identity provider's key as configured in Pistis (`google`, `github`, `entra:<tenant id>`, …); `subject` is that provider's stable ID for the account (an OIDC `sub`, a GitHub user ID), never an email or a changeable username. Any number of identities can link to one user, which is how social logins and an organization's own provider map to the same person. Each link keeps the email the provider last reported (`email`, `emailVerified`) and `lastSignInAt`.
- **Never by email** (`../docs/identity.md`): an email address is never used to find or link a user. A first sign-in whose email matches an existing user still gets a new user; joining identities is an explicit link.

Services (`libs/users`):

- `UsersService`: users (create, list, read, `PUT` profile, idempotent `disable` / `enable`, `lock`, `recordSignIn`).
- `UserProvidersService`: links (`link`: `IDENTITY_ALREADY_LINKED` if the identity is anyone's; `unlink`: never the last, `USER_LAST_PROVIDER`; `findByIdentity`). Linking and unlinking lock the user row, so concurrent changes take turns.
- `AccountsService`: users together with identities. `createUser` creates a user with a first identity in one transaction (`POST /v1/users`). `resolveSignIn(identity)` maps an authenticated external identity to a user: a linked identity signs its user in (`USER_DISABLED` if disabled); an unknown one creates a user and links it; two first sign-ins racing on the same identity end with one user (the loser retries once and finds the link). **Not exposed over HTTP**: the OIDC sign-in flow calls it after the provider authenticated the person.

The HTTP API (`../contracts/pistis.openapi.yaml`) has no authentication yet, like the other services; once tokens exist, these endpoints are for platform operators and the user themselves.

## Architecture

Same layout as Polis (`../polis/CLAUDE.md`): `src/` is the app shell (`initializeTransactions()`, `configureHttpApp`), code lives in Nest libraries under `libs/` (`core`, `users`), registered in `nest-cli.json` and aliased as `@pistis/<name>`. Database conventions, migrations (`src/database/`), and tests (`test/global-setup.ts` applies the migrations and fails on a missing one) work the same way.
