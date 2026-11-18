# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Iris

Iris is the web frontend for Aether-os (see `../CLAUDE.md`): a Next.js 16 app (App Router, React 19, TypeScript, Tailwind CSS v4, ESLint, Cache Components on) in the pnpm workspace (run `pnpm install` from `../`). Read `AGENTS.md` first: this Next.js differs from older versions (e.g. `proxy.ts` replaces middleware), and its guides are in `node_modules/next/dist/docs/`.

```bash
pnpm dev            # dev server (Turbopack) on :3000
pnpm build          # also checks prerendering (session reads must sit behind <Suspense>)
pnpm lint
pnpm test           # vitest: lib/**/*.test.ts
pnpm generate:api   # lib/api/generated from @aether-os/contracts (Hephaestus, Polis and Pistis specs)
```

Locally Iris needs Pistis, Polis and Hephaestus running (`localhost:3003` / `3001` / `3002`). Configuration is read on the server when used (`lib/config.ts`): `PISTIS_ISSUER`, `IRIS_CLIENT_ID` (`iris`), `IRIS_URL`, `IRIS_SESSION_SECRET` (≥ 32 characters), `POLIS_URL`, `HEPHAESTUS_URL`, `PISTIS_URL` (Pistis's API; defaults to the issuer's origin); outside production each has a local default, `next start` (production) needs them all (`.env.example`). To sign in locally, create a user with Pistis's `operator` development client (`../pistis/CLAUDE.md`, "Creating a user locally").

## Signing in (`lib/auth`, `app/auth`, `proxy.ts`)

Iris is Pistis's OAuth client on the server ("backend for frontend"): the browser never holds a token.

- **Flow:** `GET /auth/sign-in[?organization=<id>][&returnTo=/path]` starts an authorization code flow with PKCE, `state` and `nonce` (`openid-client`) as the public client `iris`, scope `openid profile email api offline_access`, `prompt=consent` (for a refresh token; Pistis grants it without a page), and the resource `urn:aether-os` or `urn:aether-os:org:<id>`. The pending sign-in is kept in a short-lived encrypted cookie (`iris_sign_in`, 10 minutes). `GET /auth/callback` checks it, redeems the code and stores the session; an `error` (e.g. `access_denied` for an organization the person can't enter) goes back to `/orgs?error=…`.
- **Session:** `lib/auth/session.ts`, an encrypted `httpOnly`, `SameSite=Lax` cookie (`iris_session`, a JWE: `dir` + `A256GCM`, key from `IRIS_SESSION_SECRET`; `secure` in production) holding the user (`sub`, name, email), the organization, the access, refresh and ID tokens. Read it with `currentSession()` / `requireSession()` (`lib/auth/current.ts`) inside a `<Suspense>` boundary.
- **One organization at a time:** a token is for one organization (`docs/identity.md`), so choosing another (`/orgs`, or opening `/orgs/<id>` with another organization's session) is a new sign-in for that resource. With Pistis's session there it's a redirect round trip without a page.
- **Refreshing:** `proxy.ts` refreshes the access token a minute before it expires (Server Components can't set cookies, and Pistis rotates refresh tokens, so the new ones must be stored before rendering), on this request and in the browser. If refreshing fails (expired, membership revoked) the session is dropped and pages send people to sign in.
- **Sign-out:** a `POST /auth/sign-out` form (a cross-site POST doesn't carry the `Lax` cookie) clears the session and sends people to Pistis's RP-initiated logout, which asks to confirm and comes back to `/`.
- **Server Functions** (`app/orgs/actions.ts`, `app/orgs/[organizationId]/projects/[projectId]/actions.ts`) check the session themselves: they're endpoints of their own. Pages under an organization call `requireOrganization(id, returnTo)`, which signs in again for that organization when the session is for another one.

## Pages

- `/`: signed out, a way in; signed in, on to the organization (or `/orgs`).
- `/orgs`: the person's organizations (`GET /v1/memberships?subject=` on Polis, with names) to choose from, and creating one (the creator becomes its owner).
- `/orgs/[organizationId]`: the organization with a token for it: its projects (Polis, only those the person can read; each links to its page) and agents (Hephaestus).
- `/orgs/[organizationId]/projects/[projectId]`: the project's tasks (filtered by `?status=`; the first 50), its task templates (the project's and the organization's) and a form for a new task: agent, the service account it runs as (Pistis; the list is left out without permission to read them), and whether everything it produces needs approval (criteria come from templates for now). Each render makes a fresh `Idempotency-Key` for the form, so a resubmitted form never makes two tasks.
- `…/tasks/[taskId]`: the task (status, instructions, criteria, template), cancel and retry where the lifecycle allows them, artifacts grouped by execution (newest first, verification rounds after the agent's), drafts with approve / request changes (comment required) / reject, and the executions with their usage. Mutations end with `refresh()`.
- `…/templates/[templateId]`: a template's latest version (its effective content) and a form for a task from it, one field per declared input.

## APIs

`lib/api/polis.ts`, `lib/api/hephaestus.ts` and `lib/api/pistis.ts` call the services on the server with the session's access token (`lib/api/http.ts`: JSON, extra headers such as `idempotency-key`, problem details as `ApiError` with `status` and `code`). Hephaestus: agents, tasks (list, read, create, cancel, retry), executions, artifacts and their reviews, task templates and tasks from them; Pistis: the organization's service accounts. Types come from the shared OpenAPI specs (`openapi-typescript`): `@/lib/api` for Hephaestus (`Agent`, `Task`, `Execution`, `Artifact`, `TaskTemplate`, …, `ApiSchema<…>`), `lib/api/polis.ts` for Polis.

`lib/tasks.ts` holds the pure helpers the task pages use (status labels and colours, which actions a status allows, grouping artifacts by execution, formatting), unit-tested in `lib/tasks.test.ts`. Shared components are in `app/components/` (status badge, form styles, artifact content). Generated files are committed and never edited by hand.
