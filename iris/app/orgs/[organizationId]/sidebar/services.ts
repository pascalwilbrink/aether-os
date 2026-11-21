import "server-only";

import { config } from "@/lib/config";

/** The services Iris calls, by name (also checked by Iris's `/health`). */
export const SERVICES = () => [
  { name: "Pistis", url: config.pistisUrl },
  { name: "Polis", url: config.polisUrl },
  { name: "Hephaestus", url: config.hephaestusUrl },
  { name: "Proxenos", url: config.proxenosUrl },
  { name: "Kairos", url: config.kairosUrl },
  { name: "Kerykes", url: config.kerykesUrl },
  { name: "Loculus", url: config.loculusUrl },
  { name: "Agora", url: config.agoraUrl },
  { name: "Pylon", url: config.pylonUrl },
];

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
    SERVICES().map(async ({ name, url }) => {
      try {
        const response = await fetch(new URL("/health/live", url), {
          cache: "no-store",
          signal: AbortSignal.timeout(1500),
        });
        return { name, up: response.ok };
      } catch {
        return { name, up: false };
      }
    }),
  );
}
