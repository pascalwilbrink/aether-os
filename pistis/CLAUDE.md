# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Pistis is the authentication service of Aether-os (see `../CLAUDE.md` and `../docs/identity.md`): an OpenID Connect provider that federates external identity providers and is the **only** token issuer. Other services trust Pistis tokens, never an upstream provider's.

Built so far: **users** and their **linked identities** (`user_providers`), Pistis's own **password** provider, **sign-in through external OpenID Connect providers** (any standard provider, configured), and **token issuing** with `oidc-provider` (authorization code with PKCE, organization-scoped JWT access tokens with roles from Polis's memberships). Planned next: verification and `@RequirePermission` in Krepis. Service accounts, platform services and token exchange come after.

It follows `../docs/engineering.md` like Polis: NestJS 12 (ESM, TypeScript 6), controller → service → TypeORM repository with mappers, Zod DTOs generated from the spec, `typeorm-transactional`, Postgres with migrations, tests against Postgres in containers.

## Commands

```bash
pnpm install                   # from the workspace root (../)
cp .env.example .env           # once; then `docker compose up -d` in ../ for Postgres
pnpm start:dev                 # build, run migrations, then watch mode on $PORT (default 3003)
pnpm build
pnpm lint
pnpm format
pnpm generate:api              # regenerate libs/core/src/api/generated (Pistis's spec) and libs/core/src/clients/polis/generated (Polis client)

pnpm migration:run             # apply pending migrations (on dist/: build first)
pnpm build && pnpm migration:generate src/database/migrations/<Name>   # then review it and add it to migrations/index.ts

pnpm test                      # unit tests (libs/**/*.spec.ts): transitions, mappers, config, hashing, resources
pnpm test:e2e                  # integration (libs/**/*.int-spec.ts) and e2e (test/*.e2e-spec.ts) against Postgres; needs Docker
```

## Configuration

Environment variables, validated at startup with the Zod schema in `libs/core/src/config/env.ts` (`pistisConfigModule()`). Locally from `.env` (`.env.example` has the `docker compose` defaults).

- `DATABASE_URL` (required, Postgres), `POLIS_URL` (required, Polis's API), `PORT` (3003), `NODE_ENV`.
- `PISTIS_ISSUER` (`http://localhost:3003/oidc`): the issuer, i.e. where `/oidc` is reachable from outside.
- `PISTIS_SIGNING_KEYS`: the private signing keys as a JWKS (JSON); the first one signs. `PISTIS_COOKIE_KEYS`: comma-separated keys for oidc-provider's signed cookies (≥ 32 characters each; the first signs). `PISTIS_CLIENTS`: the OIDC clients (JSON array of oidc-provider client metadata). All three are **required in production**; elsewhere Pistis generates an ES256 key per start (tokens don't survive a restart), uses a fixed cookie key, and registers Iris as the public client `iris` (redirect `http://localhost:3000/auth/callback`).
- `ACCESS_TOKEN_TTL_SECONDS` (600; 300–900), `PASSWORD_SCRYPT_COST` (17; scrypt `N = 2^cost`, 14–20).
- `PISTIS_UPSTREAM_PROVIDERS` (none by default): external OpenID Connect providers as a JSON array of `{ id, name, issuer, clientId, clientSecret?, scopes? }` (`scopes` defaults to `openid email profile`; no `clientSecret` means a public client). `id` becomes the identities' `provider` in `user_providers`, so **never change it** once people signed in with it; `password` is reserved, ids are unique. Issuers must be `https` in production. Register `<PISTIS_ISSUER origin>/interaction/callback/<id>` as the redirect URI at the provider.

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

Same layout as Polis (`../polis/CLAUDE.md`): `src/` is the app shell (`initializeTransactions()`, `configureHttpApp`), code lives in Nest libraries under `libs/` (`core`, `users`, `oidc`; `core` ← `users` ← `oidc`), registered in `nest-cli.json` and aliased as `@pistis/<name>`. Database conventions, migrations (`src/database/`), and tests (`test/global-setup.ts` applies the migrations and fails on a missing one) work the same way.

## Passwords

The `password` provider is Pistis's own: a user's password identity is a `user_providers` row with `provider = 'password'` and `subject` = the login (trimmed and lowercased, unique like any identity), and the hash lives in `password_credentials` (one per identity, deleted with it). `PasswordsService` sets one up (`POST /v1/users/{userId}/password`, `PASSWORD_ALREADY_SET` if the user has one), changes it (`PUT`, 404 without one) and verifies a login and password. `UserProvidersService.link` refuses `password` (`PASSWORD_PROVIDER_RESERVED`): it only comes with a password. `POST /v1/users` takes exactly one of `provider` and `password` as the first identity.

- **Hashing** (`PasswordHasher`): scrypt from `node:crypto`, `N = 2^PASSWORD_SCRYPT_COST`, r 8, p 1, 16-byte salt, NFKC-normalized input, stored as `scrypt$cost$r$p$salt$hash` so the cost can be raised later (old hashes still verify). Compared with `timingSafeEqual`; an unknown login hashes a dummy password, so response times don't reveal which logins exist.
- `AccountsService.signInWithPassword` is what the sign-in page calls: `INVALID_CREDENTIALS` without saying which part was wrong, `USER_DISABLED` for a disabled user.

## Tokens (`libs/oidc`)

`OidcProviderService` builds the `oidc-provider` instance; `configurePistisApp(app)` (in `main.ts` and `test/app.ts`) applies Krepis's HTTP conventions and mounts it at `/oidc` (discovery at `/oidc/.well-known/openid-configuration`, keys at `/oidc/jwks`, `/oidc/auth`, `/oidc/token`, revocation, RP-initiated logout). Its state (sessions, grants, codes, refresh tokens, interactions) is in Postgres, `oidc_payloads` (`postgresOidcAdapter`), pruned hourly.

- **Flow:** authorization code with PKCE (required, `S256`) for every client; `offline_access` (with `prompt=consent`) gives a refresh token, rotated on use. Sign-in is Pistis's own page, `GET /interaction/:uid` (outside `/v1`, plain server-rendered HTML in `pages.ts`), posting to `/interaction/:uid/login`. Consent has no page: `InteractionsController` grants the requested OpenID scopes and resources itself, after checking the resources below; otherwise the client gets `access_denied`.
- **Resources (RFC 8707) choose the organization** (`resources.ts`): `resource=urn:aether-os` (the default) gives a token without an organization; `resource=urn:aether-os:org:<organizationId>` one for that organization. Either way the access token is a JWT with `aud: aether-os` and scope `api`, signed with the first key.
- **Claims** (`extraTokenClaims`): `sub` (the user's ID), `sub_type: user`, and for an organization `org_id`, `org_roles` and `project_roles` (`{}` until project memberships exist). Roles come from Polis at **every** issue, refreshes included (`PolisDirectory`, `HttpPolisDirectory` over the generated Polis client): no membership any more or a suspended organization is `invalid_grant`, and a disabled or deleted user gets no tokens (`findAccount`). Polis unreachable means no token, never a token without the check.
- **External providers** (`upstream/upstream-sign-in.service.ts`, `openid-client`): the sign-in page shows "Sign in with <name>" per configured provider. Pistis is the provider's relying party: authorization code with PKCE, `state` and `nonce`, the upstream's metadata discovered on first use. The pending sign-in (PKCE verifier, nonce, the interaction it belongs to) is stored in `oidc_payloads` (kind `UpstreamSignIn`) under its `state`, for 10 minutes and once. The provider redirects back to the fixed `GET /interaction/callback/:provider`, which forwards to `/interaction/:uid/upstream/:provider/callback`: only there is oidc-provider's interaction cookie sent, so the code is only redeemed in the browser that started the sign-in. The verified ID token's `sub` becomes `(provider id, sub)` for `AccountsService.resolveSignIn`; `email`, `email_verified` and `name` are kept as reported, never used to match users. Upstream tokens are used for nothing else and not stored. Failures (the provider refused, a bad ID token, an expired or replayed answer, a disabled user) show the sign-in page again with a message; oidc-provider's own errors on interaction pages render as an HTML page (`InteractionErrorFilter`).
- **Tests** replace `PolisDirectory` with `test/fake-polis-directory.ts` (`createApp(polis)`); `test/oidc.e2e-spec.ts` runs the whole flow as Iris would and verifies the token against `/oidc/jwks`. `test/setup.ts` starts `test/fake-upstream.ts`, a minimal OpenID Connect provider in the test process (configured as `acme`), which `test/upstream.e2e-spec.ts` signs in through.
