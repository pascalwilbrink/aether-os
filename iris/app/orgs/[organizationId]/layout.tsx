import { Suspense } from "react";

import { Sidebar } from "./sidebar/sidebar";

/** Every page of an organization: the sidebar (`sidebar/`) beside the page. */
export default function OrganizationLayout({ children, params }: LayoutProps<"/orgs/[organizationId]">) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Suspense fallback={<SidebarPlaceholder />}>
        <Sidebar params={params} />
      </Suspense>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}

/** The sidebar's place while it loads, so the page doesn't jump. */
function SidebarPlaceholder() {
  return (
    <div className="hidden h-screen w-72 shrink-0 border-r border-zinc-200 bg-zinc-100 md:block dark:border-zinc-800/80 dark:bg-[#0f0f11]" />
  );
}
