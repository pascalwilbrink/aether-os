import "server-only";

import { config } from "@/lib/config";

/** The services Iris calls, by name. */
const SERVICES = () => [
  { name: "Pistis", url: config.pistisUrl },
  { name: "Polis", url: config.polisUrl },
  { name: "Hephaestus", url: config.hephaestusUrl },
  { name: "Proxenos", url: config.proxenosUrl },
  { name: "Kairos", url: config.kairosUrl },
  { name: "Kerykes", url: config.kerykesUrl },
  { name: "Loculus", url: config.loculusUrl },
  { name: "Agora", url: config.agoraUrl },
];

export interface ServiceStatus {
  name: string;
  up: boolean;
}

/**
 * Whether each service answers at all (any HTTP response within 1.5 s; its
 * `/health`, unversioned): reachability, not a health check of its own.
 */
export async function serviceStatuses(): Promise<ServiceStatus[]> {
  return Promise.all(
    SERVICES().map(async ({ name, url }) => {
      try {
        await fetch(new URL("/health", url), {
          cache: "no-store",
          signal: AbortSignal.timeout(1500),
        });
        return { name, up: true };
      } catch {
        return { name, up: false };
      }
    }),
  );
}
