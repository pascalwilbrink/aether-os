import "server-only";

import { isRunning, SERVICES } from "@/lib/services";

export interface ServiceStatus {
  name: string;
  up: boolean;
}

/**
 * Whether each service runs (its `/health/live` answers within 1.5 s):
 * reachability, not its dependencies (its `/health` has those).
 */
export async function serviceStatuses(): Promise<ServiceStatus[]> {
  return Promise.all(
    SERVICES().map(async ({ name, url }) => ({
      name,
      up: await isRunning(url),
    })),
  );
}
