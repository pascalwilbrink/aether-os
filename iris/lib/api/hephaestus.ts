import "server-only";

import { config } from "../config";
import type { Agent } from "./index";
import { call } from "./http";

type Page<T> = { items: T[]; nextCursor: string | null };

export const listAgents = (token: string, organizationId: string) =>
  call<Page<Agent>>(config.hephaestusUrl, `/v1/organizations/${organizationId}/agents?limit=100`, token);
