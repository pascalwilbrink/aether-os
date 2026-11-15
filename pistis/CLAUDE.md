# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Pistis is the authentication service of Aether-os (see `../CLAUDE.md` and `../docs/identity.md`): an OpenID Connect provider that federates external identity providers and is the **only** token issuer. Other services trust Pistis tokens, never an upstream provider's.

Built so far: **users** and their **linked identities** (`user_providers`), Pistis's own **password** provider, **sign-in through external OpenID Connect providers** (any standard provider, configured), and **token issuing** with `oidc-provider` (authorization code with PKCE, organization-scoped JWT access tokens with roles from Polis's memberships). It also issues **platform services** their own tokens (client credentials), has **service accounts** with API keys, issues their tokens through **token exchange** (API keys, and task tokens for Hephaestus), and protects its own API with Krepis's `AuthModule`. Planned next: Kairos's delegation (`act` for automations), and exchange rules for more services.

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

The users API (`../contracts/pistis.openapi.yaml`) is for platform operators only for now (`@PlatformAccess('platform:manage')`, verified by Krepis's `AuthModule` against Pistis's own signing keys); self-service routes for signed-in users come later. Service accounts are managed with a token for their organization (below).

## Architecture

Same layout as Polis (`../polis/CLAUDE.md`): `src/` is the app shell (`initializeTransactions()`, `configureHttpApp`), code lives in Nest libraries under `libs/` (`core`, `users`, `service-accounts`, `oidc`; `core` ← `users`, `service-accounts` ← `oidc`), registered in `nest-cli.json` and aliased as `@pistis/<name>`. Database conventions, migrations (`src/database/`), and tests (`test/global-setup.ts` applies the migrations and fails on a missing one) work the same way.

## Service accounts (`libs/service-accounts`)

An identity that isn't a person (`../docs/identity.md`, Principals): what an automation or integration acts as, in one organization. `id` (UUIDv7) is its `sub`; its roles are Polis memberships with `subjectType: service_account`, granted like a user's (Polis keeps service accounts from `approver`).

- **API:** `/v1/organizations/{organizationId}/service-accounts` (create, list, read, idempotent `disable` / `enable`) and `…/{serviceAccountId}/api-keys` (create, list, `DELETE` revokes). Managing needs `service-account:manage` (organization owners and admins), reading `member:read`; the token's organization must be the route's (Krepis), and every lookup is scoped to it.
- **API keys** (`api_keys`): `aos_` + 256 random bits (base64url), shown once in the create response; Pistis keeps only the SHA-256 (enough for a random key of that size, and a direct lookup), a `prefix` to recognise it, an optional `expiresAt` and `lastUsedAt`. A disabled account can't get new keys (`SERVICE_ACCOUNT_DISABLED`), and its keys stop working.

## Token exchange (`libs/oidc/src/token-exchange.ts`)

OAuth 2.0 Token Exchange (RFC 8693) at `/oidc/token` (`grant_type=urn:ietf:params:oauth:grant-type:token-exchange`), registered on oidc-provider (`TokenExchange.register`). Tokens are signed by `TokenSigner`, shaped like oidc-provider's (`at+jwt`, `aud: aether-os`, scope `api`); the response is `access_token`, `issued_token_type`, `token_type`, `expires_in`.

- **API key → token:** client `api-key` (public, built in, added to the configured clients), `subject_token` = the key, `subject_token_type=urn:aether-os:token-type:api-key`. A token for the service account's organization (`ACCESS_TOKEN_TTL_SECONDS`), with `sub_type: service_account`, `org_roles` and `project_roles` from Polis.
- **Task tokens:** a platform service whose client has `token_exchange: ['task-token']` (Hephaestus; client metadata like `platform_permissions`) authenticates with its secret and sends `subject_token` = the service account's ID, `subject_token_type=urn:aether-os:token-type:service-account`, `project_id`, `task_id` and optionally `expires_in` (at most 3600 seconds, the default). The token adds `project_id`, `task_id` and `act: { sub: <client>, sub_type: service }`; Krepis limits it to that project. Only for a service account with a role in the project (else `invalid_target`).
- Both check like every token: an active service account, a member of its organization in Polis, an active organization (else `invalid_grant`). Other clients get `unauthorized_client`.

## Passwords

The `password` provider is Pistis's own: a user's password identity is a `user_providers` row with `provider = 'password'` and `subject` = the login (trimmed and lowercased, unique like any identity), and the hash lives in `password_credentials` (one per identity, deleted with it). `PasswordsService` sets one up (`POST /v1/users/{userId}/password`, `PASSWORD_ALREADY_SET` if the user has one), changes it (`PUT`, 404 without one) and verifies a login and password. `UserProvidersService.link` refuses `password` (`PASSWORD_PROVIDER_RESERVED`): it only comes with a password. `POST /v1/users` takes exactly one of `provider` and `password` as the first identity.

- **Hashing** (`PasswordHasher`): scrypt from `node:crypto`, `N = 2^PASSWORD_SCRYPT_COST`, r 8, p 1, 16-byte salt, NFKC-normalized input, stored as `scrypt$cost$r$p$salt$hash` so the cost can be raised later (old hashes still verify). Compared with `timingSafeEqual`; an unknown login hashes a dummy password, so response times don't reveal which logins exist.
- `AccountsService.signInWithPassword` is what the sign-in page calls: `INVALID_CREDENTIALS` without saying which part was wrong, `USER_DISABLED` for a disabled user.

## Tokens (`libs/oidc`)

`OidcProviderService` builds the `oidc-provider` instance; `configurePistisApp(app)` (in `main.ts` and `test/app.ts`) applies Krepis's HTTP conventions and mounts it at `/oidc` (discovery at `/oidc/.well-known/openid-configuration`, keys at `/oidc/jwks`, `/oidc/auth`, `/oidc/token`, revocation, RP-initiated logout). The same public keys are also at `/.well-known/jwks.json` (`JwksController`, public, outside `/v1`, cached 5 minutes) for tools that look there; discovery and Krepis use `/oidc/jwks`. Its state (sessions, grants, codes, refresh tokens, interactions) is in Postgres, `oidc_payloads` (`postgresOidcAdapter`), pruned hourly.

- **Flow:** authorization code with PKCE (required, `S256`) for every client; `offline_access` (with `prompt=consent`) gives a refresh token, rotated on use. Sign-in is Pistis's own page, `GET /interaction/:uid` (outside `/v1`, plain server-rendered HTML in `pages.ts`), posting to `/interaction/:uid/login`. Consent has no page: `InteractionsController` grants the requested OpenID scopes and resources itself, after checking the resources below; otherwise the client gets `access_denied`.
- **Resources (RFC 8707) choose the organization** (`resources.ts`): `resource=urn:aether-os` (the default) gives a token without an organization; `resource=urn:aether-os:org:<organizationId>` one for that organization. Either way the access token is a JWT with `aud: aether-os` and scope `api`, signed with the first key.
- **Claims** (`extraTokenClaims`): `sub` (the user's ID), `sub_type: user`, and for an organization `org_id`, `org_roles` and `project_roles` (the user's explicit project grants in it, `GET /v1/project-memberships`; Krepis applies the cap again). Roles come from Polis at **every** issue, refreshes included (`PolisDirectory`, `HttpPolisDirectory` over the generated Polis client): no membership any more or a suspended organization is `invalid_grant`, and a disabled or deleted user gets no tokens (`findAccount`). Polis unreachable means no token, never a token without the check.
- **External providers** (`upstream/upstream-sign-in.service.ts`, `openid-client`): the sign-in page shows "Sign in with <name>" per configured provider. Pistis is the provider's relying party: authorization code with PKCE, `state` and `nonce`, the upstream's metadata discovered on first use. The pending sign-in (PKCE verifier, nonce, the interaction it belongs to) is stored in `oidc_payloads` (kind `UpstreamSignIn`) under its `state`, for 10 minutes and once. The provider redirects back to the fixed `GET /interaction/callback/:provider`, which forwards to `/interaction/:uid/upstream/:provider/callback`: only there is oidc-provider's interaction cookie sent, so the code is only redeemed in the browser that started the sign-in. The verified ID token's `sub` becomes `(provider id, sub)` for `AccountsService.resolveSignIn`; `email`, `email_verified` and `name` are kept as reported, never used to match users. Upstream tokens are used for nothing else and not stored. Failures (the provider refused, a bad ID token, an expired or replayed answer, a disabled user) show the sign-in page again with a message; oidc-provider's own errors on interaction pages render as an HTML page (`InteractionErrorFilter`).
- **Platform services** (`sub_type: service`, no organization) get their own token with client credentials: a client in `PISTIS_CLIENTS` with `grant_types: ['client_credentials']`, a secret, and `platform_permissions` (a custom client property: the platform permissions it may ask for, e.g. Hephaestus `['platform:read']`). Their tokens are for the platform resource only and carry the requested permissions it was given as `scope`; a user's grant never gets them. Outside production Hephaestus is registered with the secret `hephaestus-dev-secret` (and may exchange for task tokens), and an `operator` client (`operator-dev-secret`, `platform:read` and `platform:manage`) for local tooling.
- **Sign-out** (RP-initiated logout): Pistis asks to confirm on its own page (`signOutPage`; another site can't sign people out with a link), then sends people back to the client's `post_logout_redirect_uri`, or shows `signedOutPage`.
- **Pistis's own calls to Polis** use a token it signs itself (`PistisServiceTokens`, `sub: pistis`, `platform:read`, 5 minutes) with `TokenSigner`, which signs with the same keys (`SIGNING_KEYS`) as oidc-provider and shapes tokens like its own.
- **Tests** replace `PolisDirectory` with `test/fake-polis-directory.ts` (`createApp(polis)`); `test/oidc.e2e-spec.ts` runs the whole flow as Iris would and verifies the token against `/oidc/jwks`. `operatorAgent(app)` (`test/app.ts`) calls Pistis's API with a `platform:manage` token signed by the app's own `TokenSigner`. `test/setup.ts` starts `test/fake-upstream.ts`, a minimal OpenID Connect provider in the test process (configured as `acme`), which `test/upstream.e2e-spec.ts` signs in through.

## Creating a user locally

Users come from signing in through an external provider, or from the operator API. Locally, with the `operator` development client:

```bash
TOKEN=$(curl -s -u operator:operator-dev-secret -d grant_type=client_credentials -d scope=platform:manage \
  http://localhost:3003/oidc/token | jq -r .access_token)
curl -s -X POST http://localhost:3003/v1/users -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"displayName":"Ada Lovelace","email":"ada@example.com","password":{"login":"ada@example.com","password":"correct horse battery"}}'
```

Then sign in at Iris (`http://localhost:3000`) with that login and password.
