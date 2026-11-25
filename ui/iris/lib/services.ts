import { config } from "./config";

export interface Service {
  name: string;
  url: string;
}

/** The services Iris calls, by name (its sidebar, `/health` and error messages). */
export const SERVICES = (): Service[] => [
  { name: "Pistis", url: config.pistisUrl },
  { name: "Polis", url: config.polisUrl },
  { name: "Hephaestus", url: config.hephaestusUrl },
  { name: "Proxenos", url: config.proxenosUrl },
  { name: "Kairos", url: config.kairosUrl },
  { name: "Kerykes", url: config.kerykesUrl },
  { name: "Loculus", url: config.loculusUrl },
  { name: "Agora", url: config.agoraUrl },
  { name: "Pylon", url: config.pylonUrl },
  { name: "Seshat", url: config.seshatUrl },
];

/** The name of the service at `url` (by origin), for messages. */
export function serviceNameFor(
  url: string | URL,
  services: Service[] = SERVICES(),
): string | null {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }
  return (
    services.find((service) => new URL(service.url).origin === origin)?.name ??
    null
  );
}

/**
 * How long `/health` and the proxy wait for a service's `/health/live`: the
 * same, so the proxy never sends a page to wait for a service that the
 * waiting page then finds up (and reloads, again and again).
 */
export const HEALTH_TIMEOUT_MS = 3000;

/** Whether a service answers at all (its `/health/live`, within `timeoutMs`). */
export async function isRunning(
  url: string,
  timeoutMs = 1500,
): Promise<boolean> {
  try {
    const response = await fetch(new URL("/health/live", url), {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}
