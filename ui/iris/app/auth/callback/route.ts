import type { NextRequest } from "next/server";

import { signIn } from "@/lib/auth/current";

/** Pistis's answer to a sign-in. `@aether-os/sign-in` does it. */
export function GET(request: NextRequest) {
  return signIn.routes.callback(request);
}
