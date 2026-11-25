import Link from "next/link";
import { Suspense } from "react";

import { LogoIcon, ThemeSwitch } from "@aether-os/design";

import { getOrganization } from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import { orgPath } from "@/lib/pages";
import { THEME_KEY } from "@/lib/theme";

import { SignOutButton } from "../../components/sign-out";
import { OrganizationNav } from "./nav";

/**
 * An organization's pages: its name, the sections, switching organization
 * and signing out. Each page checks the person itself (`requireAdmin`).
 */
export default function OrganizationLayout({
  children,
  params,
}: LayoutProps<"/orgs/[organizationId]">) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/orgs" className="flex items-center gap-2 font-semibold">
              <LogoIcon className="size-6 text-indigo-600 dark:text-indigo-400" />
              Atlas
            </Link>
            <span className="text-zinc-400">/</span>
            <Suspense fallback={<span className="text-zinc-500">…</span>}>
              <OrganizationName params={params} />
            </Suspense>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/orgs"
              className="text-sm text-zinc-600 underline dark:text-zinc-400"
            >
              Switch organization
            </Link>
            <SignOutButton />
            <ThemeSwitch storageKey={THEME_KEY} />
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-2 sm:px-6">
          <Suspense fallback={null}>
            <Nav params={params} />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

async function OrganizationName({
  params,
}: Pick<LayoutProps<"/orgs/[organizationId]">, "params">) {
  const { organizationId } = await params;
  const session = await requireAdmin(organizationId, orgPath(organizationId));
  const organization = await getOrganization(
    session.accessToken,
    organizationId,
  );
  return <span className="font-medium">{organization.name}</span>;
}

async function Nav({
  params,
}: Pick<LayoutProps<"/orgs/[organizationId]">, "params">) {
  const { organizationId } = await params;
  return <OrganizationNav organizationId={organizationId} />;
}
