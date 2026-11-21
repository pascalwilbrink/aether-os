import type { Metadata } from "next";

import { PublicShell } from "../components/public-shell";
import { Recovering } from "../components/recovering";

export const metadata: Metadata = { title: "Waiting for Aether-os" };

/**
 * Shown in place of a page (`proxy.ts` rewrites to it, keeping the URL)
 * when the session needs a new token and Pistis doesn't answer yet: it
 * waits for the services and reloads the page the browser asked for.
 */
export default function Unavailable() {
  return (
    <PublicShell>
      <Recovering />
    </PublicShell>
  );
}
