import type { NextRequest } from "next/server";

import { signIn } from "@/lib/auth/current";

/** Out of the app and of Pistis (a POST from its own form). `@aether-os/sign-in` does it. */
export function POST(request: NextRequest) {
  return signIn.routes.signOut(request);
}
