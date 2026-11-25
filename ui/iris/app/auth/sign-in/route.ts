import type { NextRequest } from "next/server";

import { signIn } from "@/lib/auth/current";

/** Off to Pistis to sign in (or switch organization). `@aether-os/sign-in` does it. */
export function GET(request: NextRequest) {
  return signIn.routes.signIn(request);
}
