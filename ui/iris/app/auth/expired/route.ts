import type { NextRequest } from "next/server";

import { signIn } from "@/lib/auth/current";

/** Out of the app after an API refused the session's token (401). `@aether-os/sign-in` does it. */
export function GET(request: NextRequest) {
  return signIn.routes.expired(request);
}
