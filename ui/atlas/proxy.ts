import type { NextRequest } from "next/server";

import { signIn } from "@/lib/auth/current";

/**
 * Keeps the access token fresh before pages render (`@aether-os/sign-in`):
 * Server Components can't set cookies, and Pistis rotates refresh tokens.
 * If refreshing is refused the session is dropped and pages send people to
 * sign in; if Pistis just doesn't answer, the session is kept while its
 * access token works.
 */
export function proxy(request: NextRequest) {
  return signIn.proxy(request);
}

export const config = {
  // Pages only: not Next's assets, nor the sign-in routes (which manage the
  // cookie themselves), nor `/health`.
  matcher: ["/((?!_next/|auth/|health|favicon.ico).*)"],
};
