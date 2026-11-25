# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Sign-in

`@aether-os/sign-in` signs people in to Aether-os's web apps (Iris, `../iris`, and Atlas, `../atlas`) through Pistis (`../../pistis`), on the server: each app is Pistis's OAuth client as a "backend for frontend", and the browser never holds a token. It holds what the apps share; each app only says who it is (`createSignIn(settings, { cookiePrefix })` in its `lib/auth/current.ts`) and adds its own rules on top (Iris: one organization at a time, `requireOrganization`; Atlas: owners and admins only, `requireAdmin`).

```bash
pnpm install    # from the workspace root (../../); builds the package (`prepare`)
pnpm build      # tsc -> dist/ (ESM + .d.ts)
pnpm dev        # tsc --watch
pnpm lint       # type-check
pnpm test       # vitest: src/**/*.test.ts (cookies, fingerprints, return paths, refreshAfterForbidden)
```

Apps import the built package (`dist/`), never `src/`; after changing it, `pnpm build` here (or `pnpm dev`) before an app sees it. Next.js is a peer dependency (the app's copy): `next/headers`, `next/navigation`, `next/server`.

### What `createSignIn` gives an app

- **Settings** (`SignInSettings`, a function read when used, at request time): Pistis's `issuer`, the app's `clientId` (a public client at Pistis: `iris`, `atlas`), its `appUrl` (the redirect URIs are built from it), the `sessionSecret` (≥ 32 characters), `secureCookies` and `pistisUrl` (Pistis's API, for its `/health/live`).
- **Flow** (`routes.signIn`, `GET /auth/sign-in[?organization=<id>][&returnTo=/path]`): an authorization code flow with PKCE, `state` and `nonce` (`openid-client`), scope `openid profile email api offline_access`, `prompt=consent` (for a refresh token; Pistis grants it without a page), and the resource `urn:aether-os` or `urn:aether-os:org:<id>`. The pending sign-in is kept in a short-lived encrypted cookie (`<prefix>_sign_in`, 10 minutes). `routes.callback` (`GET /auth/callback`) checks it, redeems the code and stores the session; an `error` (e.g. `access_denied` for an organization the person can't enter) goes back to `/orgs?error=…`.
- **Session:** an encrypted `httpOnly`, `SameSite=Lax` cookie (`<prefix>_session`, a JWE: `dir` + `A256GCM`, the key from the session secret; `Secure` with `secureCookies`) holding the user (`sub`, name, email), the organization, and the access, refresh and ID tokens. `currentSession()` / `requireSession(returnTo)` / `requireOrganization(id, returnTo)` read it, inside a `<Suspense>` boundary. A token is for one organization (`docs/identity.md`), so choosing another is a new sign-in for that resource; with Pistis's session there it's a redirect round trip without a page.
- **Refreshing** (`proxy(request, options)`, from the app's `proxy.ts`): the access token is refreshed a minute before it expires (Server Components can't set cookies, and Pistis rotates refresh tokens, so the new ones are stored before rendering), on this request and in the browser. A refused refresh (expired, membership revoked; `isRefusal`) drops the session. If Pistis doesn't answer (its `/health/live` doesn't either), the session is kept while its access token works; after that the app's `unavailablePath` is shown (Iris's `/unavailable`), or without one the session is dropped. `pathHeader` puts the page's path in a request header for the server (Iris: `PATH_HEADER`).
- **A refused token** (`routes.expired`, `GET /auth/expired?token=<fingerprint>`): where an app goes when a service answers `401`: drops the session and lands on the home page with "Your session expired". Only a session holding that token (`tokenFingerprint`) is dropped, so a link from elsewhere can't sign people out.
- **A refused page** (`routes.refresh`, `GET /auth/refresh?token=<fingerprint>&returnTo=<page>`, and `refreshAfterForbidden`): a page refused with a `403` may have a token older than the person's roles; once per token it gets a fresh one (marked `refreshedForForbidden`, so a refusal with it is shown, not refreshed again) and goes back. Iris uses it; Atlas doesn't mount the route.
- **Sign-out** (`routes.signOut`, `POST /auth/sign-out`): a form POST (a cross-site POST doesn't carry the `Lax` cookie) that clears the session and sends people to Pistis's RP-initiated logout, back to `/`.
- Signing in, the callback and signing out say "Pistis can't be reached" (`?error=pistis-unavailable`) instead of failing, and sign-out still leaves the app.

Also exported: `organizationRoles` (the token's `org_roles`, unverified: for display and navigation only, services check tokens themselves), `isRunning` (a service's `/health/live`), `safeReturnTo`, `tokenFingerprint`, `seal` / `unseal`, and the `Session` type.
