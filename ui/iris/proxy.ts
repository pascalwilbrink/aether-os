import type { NextRequest } from "next/server";

import { PATH_HEADER } from "@aether-os/sign-in";

import { signIn } from "@/lib/auth/current";

/**
 * Keeps the access token fresh before pages render (`@aether-os/sign-in`):
 * Server Components can't set cookies, and Pistis rotates refresh tokens.
 * Puts the page's path in `PATH_HEADER`, for a page refused with a 403 to
 * come back to (`lib/api/http.ts`). When Pistis doesn't answer and the
 * token has expired, `/unavailable` waits for the services and reloads.
 */
export function proxy(request: NextRequest) {
  return signIn.proxy(request, {
    pathHeader: PATH_HEADER,
    unavailablePath: "/unavailable",
  });
}

export const config = {
  // Pages only: not Next's assets, nor the sign-in routes (which manage the
  // cookie themselves), nor `/health` (no session; the waiting page reads it).
  matcher: ["/((?!_next/|auth/|health|favicon.ico).*)"],
};
