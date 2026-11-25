import { redirect } from "next/navigation";
import { Suspense } from "react";

import { currentSession } from "@/lib/auth/current";

import { Notice } from "./components/notice";
import { PublicShell } from "./components/public-shell";

/** Signed out: a way in. Signed in: straight to the organization (or choosing one). */
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <PublicShell>
      <Suspense fallback={<p>Loading…</p>}>
        <Landing searchParams={searchParams} />
      </Suspense>
    </PublicShell>
  );
}

async function Landing({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const session = await currentSession();
  if (session) {
    redirect(
      session.organizationId ? `/orgs/${session.organizationId}` : "/orgs",
    );
  }
  const { error } = await searchParams;

  return (
    <section className="space-y-6">
      <Notice error={typeof error === "string" ? error : undefined} />
      <h1 className="text-2xl font-semibold">Welcome to Aether-os</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Build, run and support AI agents.
      </p>
      <a
        href="/auth/sign-in"
        className="inline-block rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500"
      >
        Sign in
      </a>
    </section>
  );
}
