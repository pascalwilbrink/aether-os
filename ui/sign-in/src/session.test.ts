import { describe, expect, it } from "vitest";

import { seal, unseal } from "./seal.js";
import {
  needsRefresh,
  openPendingSignIn,
  openSession,
  refreshAfterForbidden,
  safeReturnTo,
  sealPendingSignIn,
  sealSession,
  type Session,
  tokenFingerprint,
} from "./session.js";

const SECRET = "a-test-secret-that-is-long-enough-123";

const session: Session = {
  sub: "0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
  name: "Ada",
  email: "ada@example.com",
  organizationId: null,
  accessToken: "access",
  accessTokenExpiresAt: Date.now() + 600_000,
  refreshToken: "refresh",
  idToken: "id",
};

describe("session cookies", () => {
  it("round-trips a session, encrypted", async () => {
    const sealed = await sealSession(session, SECRET);
    expect(sealed).not.toContain("access");
    expect(sealed.split(".")).toHaveLength(5); // a compact JWE
    await expect(openSession(sealed, SECRET)).resolves.toEqual(session);
  });

  it("refuses a cookie sealed with another secret, changed, or missing", async () => {
    const sealed = await sealSession(session, SECRET);
    await expect(openSession(sealed, `${SECRET}-other`)).resolves.toBeNull();
    const tampered = `${sealed.slice(0, -4)}AAAA`;
    await expect(openSession(tampered, SECRET)).resolves.toBeNull();
    await expect(openSession(undefined, SECRET)).resolves.toBeNull();
    await expect(openSession("not-a-cookie", SECRET)).resolves.toBeNull();
  });

  it("expires sealed values", async () => {
    const sealed = await seal({ a: 1 }, SECRET, -10);
    await expect(unseal(sealed, SECRET)).resolves.toBeNull();
  });

  it("keeps the pending sign-in", async () => {
    const pending = {
      state: "s",
      nonce: "n",
      codeVerifier: "v",
      organizationId: null,
      returnTo: "/orgs",
    };
    await expect(
      openPendingSignIn(await sealPendingSignIn(pending, SECRET), SECRET),
    ).resolves.toEqual(pending);
  });

  it("refreshes a minute before the access token expires", () => {
    const now = Date.now();
    expect(
      needsRefresh({ ...session, accessTokenExpiresAt: now + 120_000 }, now),
    ).toBe(false);
    expect(
      needsRefresh({ ...session, accessTokenExpiresAt: now + 30_000 }, now),
    ).toBe(true);
    expect(
      needsRefresh({ ...session, accessTokenExpiresAt: now - 1 }, now),
    ).toBe(true);
  });

  it("only returns to paths on the app", () => {
    expect(safeReturnTo("/orgs/x")).toBe("/orgs/x");
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("/\\evil.example")).toBe("/");
    expect(safeReturnTo(null)).toBe("/");
  });
});

describe("tokenFingerprint", () => {
  it("is stable per token, differs between tokens, and doesn't contain the token", () => {
    expect(tokenFingerprint("access")).toBe(tokenFingerprint("access"));
    expect(tokenFingerprint("access")).not.toBe(tokenFingerprint("other"));
    expect(tokenFingerprint("access")).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

describe("refreshAfterForbidden", () => {
  const token = "token-a";
  const session = { accessToken: token };
  const page = { serverAction: false, page: true, path: "/orgs/o/projects/p?status=failed" };

  it("sends a refused page for a token with current roles, and back", () => {
    const target = refreshAfterForbidden(session, token, page);
    const url = new URL(target!, "https://iris.test");
    expect(url.pathname).toBe("/auth/refresh");
    expect(url.searchParams.get("token")).toBe(tokenFingerprint(token));
    expect(url.searchParams.get("returnTo")).toBe("/orgs/o/projects/p?status=failed");
  });

  it("shows the refusal once the token is fresh, so it can't loop", () => {
    expect(
      refreshAfterForbidden(
        { ...session, refreshedForForbidden: tokenFingerprint(token) },
        token,
        page,
      ),
    ).toBeNull();
    // A later token (the proxy refreshed it) gets one try again.
    expect(
      refreshAfterForbidden(
        { accessToken: "token-b", refreshedForForbidden: tokenFingerprint(token) },
        "token-b",
        page,
      ),
    ).not.toBeNull();
  });

  it("leaves forms, other requests and other tokens alone", () => {
    expect(refreshAfterForbidden(session, token, { ...page, serverAction: true })).toBeNull();
    expect(refreshAfterForbidden(session, token, { ...page, page: false })).toBeNull();
    expect(refreshAfterForbidden(session, token, { ...page, path: null })).toBeNull();
    expect(refreshAfterForbidden(session, "someone-else", page)).toBeNull();
    expect(refreshAfterForbidden(null, token, page)).toBeNull();
  });

  it("never sends anyone off-site", () => {
    const target = refreshAfterForbidden(session, token, { ...page, path: "//evil.test" });
    expect(new URL(target!, "https://iris.test").searchParams.get("returnTo")).toBe("/");
  });
});
