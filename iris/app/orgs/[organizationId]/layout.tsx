import { Suspense } from "react";

import { InboxLink } from "./inbox-link";

/** Every page of an organization, with the link to the signed-in person's inbox above it. */
export default function OrganizationLayout({ children, params }: LayoutProps<"/orgs/[organizationId]">) {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Suspense fallback={null}>
          <InboxLink params={params} />
        </Suspense>
      </div>
      {children}
    </>
  );
}
