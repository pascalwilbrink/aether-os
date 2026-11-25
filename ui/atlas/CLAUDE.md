# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Atlas

Atlas is Aether-os's management interface (see `../../CLAUDE.md`): where an organization's owners and admins manage it: its departments, teams and people, and who has access with which role (Polis). It is, in `ui/` beside Iris (`../iris`) and the design system both are built with (`../design`, `@aether-os/design`): a Next.js 16 app (App Router, React 19, TypeScript, Tailwind CSS v4, ESLint, Cache Components on) in the pnpm workspace (run `pnpm install` from `../../`). Read `AGENTS.md` first: this Next.js differs from older versions (e.g. `proxy.ts` replaces middleware), and its guides are in `node_modules/next/dist/docs/`.

The theme: `app/layout.tsx` puts `themeScript(THEME_KEY)` in `<head>`, `ThemeSwitch` in the header, remembered under `atlas-theme` (`lib/theme.ts`); `app/globals.css` imports `@aether-os/design/theme.css` after Tailwind. `GET /health/live` answers while it runs.

```bash
pnpm dev            # dev server (Turbopack) on :3012 (the root's `pnpm start:dev` too, or ATLAS_PORT)
pnpm build
pnpm start          # production server on :3012
pnpm lint
pnpm test           # vitest: lib/**/*.test.ts
pnpm generate:api   # lib/api/generated/polis-api.ts from @aether-os/contracts (Polis's spec)
```

Locally Atlas needs Pistis (`localhost:3003`: sign-in, and members' names and email addresses, `GET …/users`, and service accounts' names) and Polis (`3001`). Configuration is read on the server when used (`lib/config.ts`): `PISTIS_ISSUER`, `ATLAS_CLIENT_ID` (`atlas`), `ATLAS_URL`, `ATLAS_SESSION_SECRET` (≥ 32 characters), `POLIS_URL`, `PISTIS_URL` (defaults to the issuer's origin); outside production each has a local default, `next start` (production) needs them all (`.env.example`). Pistis registers the public client `atlas` (redirect `http://localhost:3012/auth/callback`) outside production. To sign in locally, create a user with Pistis's `operator` client (`../../pistis/CLAUDE.md`, "Creating a user locally") and an organization they own (in Iris).

## Signing in, and who gets in (`lib/auth/current.ts`, `app/auth`, `proxy.ts`)

Atlas is Pistis's OAuth client on the server ("backend for frontend"), through `@aether-os/sign-in` (`../sign-in/CLAUDE.md`), shared with Iris: `lib/auth/current.ts` sets it up with its own client (`atlas`) and cookies (`atlas_session`, `atlas_sign_in`); the browser never holds a token. The routes under `app/auth/` each call the package's, and `proxy.ts` its `proxy` (no `unavailablePath`: with Pistis down and the token expired, the session ends). `GET /auth/sign-in[?organization=<id>][&returnTo=/path]` starts an authorization code flow with PKCE for the platform resource or an organization's; `GET /auth/callback` finishes it; `POST /auth/sign-out` signs out of Atlas and Pistis; `GET /auth/expired?token=<fingerprint>` drops a session whose token a service refused (`401`, from `call()` in `lib/api/http.ts`). `proxy.ts` refreshes the access token a minute before it expires; a refused refresh ends the session. Unlike Iris there's no refresh after a `403`: Atlas only lets in people whose token already says they may manage.

- **Owners and admins only.** `/orgs` lists only the organizations where the person is an `owner` or `admin` (their memberships, from Polis); choosing one is a sign-in for a token scoped to it. Every page and Server Function of an organization calls `requireAdmin(organizationId, returnTo)` (`lib/auth/current.ts`): no session goes to sign in, a token for another organization signs in for this one, and a token without `owner` or `admin` in its `org_roles` (`isAdmin`, `lib/admin.ts`) goes back to `/orgs?error=not-admin`. A layout doesn't guard its pages (they render in parallel), so the check is in each. Polis checks every call itself (`org:manage` for departments and teams, `member:manage` for people): the roles in Atlas decide who gets in, not what's allowed.

## Pages (`app/orgs/[organizationId]`)

- **Overview:** how many active departments and teams, how many people (and how many signed up).
- **Departments:** the list (people and teams in each), a new one (name, slug, description); a department's page changes its name and description, archives it (Polis refuses while active projects are in it, `DEPARTMENT_HAS_PROJECTS`), and lists its people, teams and projects (read only: projects are Iris's).
- **Teams:** the list (their departments), a new one (name, slug, description, departments); a team's page changes them, archives it (it keeps its members, takes no changes), adds and removes members (the organization's people).
- **Members** (`/members`): who has access (Polis's user memberships, named from Pistis's `GET …/users` or the person linked to them, linked to that person's page) with their role: change it, remove access (Polis removes their project roles too); and **Give access** to a person who has signed up (linked to a user) and has none yet. Atlas shows and sets one role per member, the highest (`highestRole`). Not your own (you'd lock yourself out), an owner's only as an owner, and only owners are offered `owner` (`assignableRoles`): Polis refuses the rest anyway (and the last owner, `LAST_OWNER`). Service accounts stay in Iris.
- **Projects** (`/projects`): every project; a project's page lists who has a role in it (people and service accounts) to change or remove, and gives a member a role (`withoutProjectRole`: members without one, not owners or admins, who are admins of every project; Polis caps the role by the organization role, `PROJECT_ROLE_EXCEEDS_CAP`). An archived project's roles are read only. Creating and changing projects stays in Iris.
- **People:** the list (role or email, departments, whether they've signed up), someone new (name, email, role, gender, description, departments); a person's page changes them, deletes them (out of every department and team), lists their teams, and shows their **Access**: their role to change or remove, access to give once they've signed up, or that they haven't yet. A person is linked by Polis to the user with the same email address.

`lib/members.ts` (tested) joins memberships, Pistis's users and persons; `lib/access.ts` loads them for a page. A role `<select>` is keyed on the current role, since a form resets after its action and would otherwise show the old one.

Forms are client components (`useActionState`) over Server Functions (`actions.ts` beside each page), bound to the organization's and the resource's IDs. A refused form shows Polis's message (`messageOf`, `lib/api/messages.ts`, by problem code) and keeps what was typed (`FormState.values`, `lib/forms.ts`); department checkboxes show the active departments and archived ones only while checked (Polis keeps someone in an archived department but takes no one new). Lists are read whole, page by page (`all`, `lib/api/http.ts`). A Polis that doesn't answer is an error page with "Try again" (`app/error.tsx`).

Take the look from `@aether-os/design` (form styles, icons, the theme), never by copying Iris's components; what both apps need and knows nothing about a service's data goes into `../design`. Its built package is what Atlas imports: after changing it, `pnpm build` there (or `pnpm dev`).
