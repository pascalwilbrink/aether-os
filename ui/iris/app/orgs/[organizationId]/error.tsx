"use client";

import { Recovering } from "../../components/recovering";

/**
 * A page of an organization that couldn't load: inside the layout, so the
 * sidebar (with the services' status) stays.
 */
export default function OrganizationPageError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return <Recovering error={error} retry={retry} />;
}
