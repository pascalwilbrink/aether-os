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
- **Server Functions** (`app/orgs/actions.ts`, `app/orgs/[organizationId]/agents/actions.ts`, `app/orgs/[organizationId]/members/actions.ts`, `app/orgs/[organizationId]/projects/[projectId]/actions.ts`) check the session themselves: they're endpoints of their own. A refused form returns what was submitted (`values`, from `lib/forms.ts`) and the form starts from it, since React resets a form after its action; a `<select>` is keyed on its default as well, because a reset doesn't move it to a new one. Errors become messages with `messageOf` (`lib/api/messages.ts`: by problem `code`, then status). Pages under an organization call `requireOrganization(id, returnTo)`, which signs in again for that organization when the session is for another one.

## Pages

- `/`: signed out, a way in; signed in, on to the organization (or `/orgs`).
- `/orgs`: the person's organizations (`GET /v1/memberships?subject=` on Polis, with names) to choose from, and creating one (the creator becomes its owner).
- `/orgs/[organizationId]`: the organization with a token for it: its projects (Polis, only those the person can read; each links to its page) and agents (Hephaestus; each links to its page, and a link to a new one).
- `/orgs/[organizationId]/members`: the organization's people (Polis's user memberships with names and emails from Pistis's `GET …/users`) and service accounts (Pistis, with their Polis membership), each with their organization role: change it (one role), remove someone (Polis removes their project roles too; after a confirmation), create a service account with a role (member or viewer: two calls, so an account left without a role shows a Grant form), disable and enable one. You can't change your own role or remove yourself here. Adding people waits for invitations (Kerykes); for now people join by founding an organization, or through the API.
- `/orgs/[organizationId]/agents/new`: a new agent, a name and description; then on to its page for its first version.
- `/orgs/[organizationId]/agents/[agentId]`: the agent, which version new tasks run, its versions (newest first; the published one, else the latest, open) with publish for drafts, archive (after a confirmation), and a form for the next version, starting from the latest (versions never change, so editing is writing a new one): instructions, model (a select of the catalogue's active models, `GET /v1/models`, grouped by provider with their prices; a version whose model is no longer active says so and asks for another), temperature, max tokens, mode, capabilities, sandbox, and "publish it" to publish at once. Tools and skills carry over unchanged (Iris can't edit them yet). No role check in Iris: Hephaestus refuses (`agent:write`, `agent:publish`) and the form says so.
- `/orgs/[organizationId]/projects/[projectId]`: the project's tasks (filtered by `?status=`; the first 50), its task templates (the project's and the organization's) **Access** (who has a project role: change, remove, and add someone from the organization who has none; owners and admins aren't offered, being admins in every project already; Polis's refusals, such as the role cap, come back as messages), and a form for a new task: agent, the service account it runs as (only active ones with a role in the project, which Pistis's task token needs; otherwise the form says where to give one), and whether everything it produces needs approval (criteria come from templates for now). Each render makes a fresh `Idempotency-Key` for the form, so a resubmitted form never makes two tasks.
- `…/tasks/[taskId]`: the task (status, instructions, criteria, template), cancel and retry where the lifecycle allows them, artifacts grouped by execution (newest first, verification rounds after the agent's), drafts with approve / request changes (comment required) / reject, and the executions with their usage and cost. Mutations end with `refresh()`.
- `…/templates/[templateId]`: a template's latest version (its effective content) and a form for a task from it, one field per declared input (the same service accounts as the new-task form).

## APIs

`lib/api/polis.ts`, `lib/api/hephaestus.ts` and `lib/api/pistis.ts` call the services on the server with the session's access token (`lib/api/http.ts`: JSON, extra headers such as `idempotency-key`, problem details as `ApiError` with `status` and `code`). Hephaestus: agents and their versions (create, publish, archive), tasks (list, read, create, cancel, retry), executions, artifacts and their reviews, task templates and tasks from them; Polis: organization and project memberships (list, grant, change, remove); Pistis: the organization's people and its service accounts (create, disable, enable). Types come from the shared OpenAPI specs (`openapi-typescript`): `@/lib/api` for Hephaestus (`Agent`, `Task`, `Execution`, `Artifact`, `TaskTemplate`, …, `ApiSchema<…>`), `lib/api/polis.ts` for Polis.

`lib/tasks.ts` holds the pure helpers the task pages use (status labels and colours, which actions a status allows, grouping artifacts by execution, formatting), unit-tested in `lib/tasks.test.ts`; `lib/agents.ts` those of the agent pages (the version form's fields from a version, and the request from the fields, with its checks; version statuses), in `lib/agents.test.ts`; `lib/members.ts` those of members and access (joining memberships with names, which project roles to offer, which service accounts can run tasks), in `lib/members.test.ts`. Shared components are in `app/components/` (status badge, form styles, artifact content, and `action-forms.tsx`: a button or a role picker for one bound Server Function). Generated files are committed and never edited by hand.
