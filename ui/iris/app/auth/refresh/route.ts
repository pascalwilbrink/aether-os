import type { NextRequest } from "next/server";

import { signIn } from "@/lib/auth/current";

/** A token with current roles after a page was refused (403), then back. `@aether-os/sign-in` does it. */
export function GET(request: NextRequest) {
  return signIn.routes.refresh(request);
}
