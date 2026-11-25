import "server-only";

import { config } from "../config";
import type { components } from "./generated/kairos-api";
import { call, type Page } from "./http";

/** Kairos types, generated from ../contracts/kairos.openapi.yaml. */
export type KairosSchemas = components["schemas"];
export type Automation = KairosSchemas["AutomationResponse"];
export type AutomationRequest = KairosSchemas["AutomationRequest"];
export type AutomationRun = KairosSchemas["AutomationRunResponse"];

const kairos = <T>(
  path: string,
  token: string,
  init?: Parameters<typeof call>[3],
) => call<T>(config.kairosUrl, path, token, init);

const automationsOf = (organizationId: string, projectId: string) =>
  `/v1/organizations/${organizationId}/projects/${projectId}/automations`;

// --- A project's automations (`automation:read`, `automation:manage`) ---

export const listAutomations = (
  token: string,
  organizationId: string,
  projectId: string,
) =>
  kairos<Page<Automation>>(
    `${automationsOf(organizationId, projectId)}?limit=100`,
    token,
  );

export const getAutomation = (
  token: string,
  organizationId: string,
  projectId: string,
  automationId: string,
) =>
  kairos<Automation>(
    `${automationsOf(organizationId, projectId)}/${automationId}`,
    token,
  );

export const createAutomation = (
  token: string,
  organizationId: string,
  projectId: string,
  body: AutomationRequest,
) =>
  kairos<Automation>(automationsOf(organizationId, projectId), token, {
    method: "POST",
    body,
  });

export const updateAutomation = (
  token: string,
  organizationId: string,
  projectId: string,
  automationId: string,
  body: AutomationRequest,
) =>
  kairos<Automation>(
    `${automationsOf(organizationId, projectId)}/${automationId}`,
    token,
    { method: "PUT", body },
  );

/** `pause`, `resume` or `archive`. */
export const changeAutomationStatus = (
  token: string,
  organizationId: string,
  projectId: string,
  automationId: string,
  change: "pause" | "resume" | "archive",
) =>
  kairos<Automation>(
    `${automationsOf(organizationId, projectId)}/${automationId}/${change}`,
    token,
    {
      method: "POST",
    },
  );

/** Each time it fired, newest first. */
export const listAutomationRuns = (
  token: string,
  organizationId: string,
  projectId: string,
  automationId: string,
) =>
  kairos<Page<AutomationRun>>(
    `${automationsOf(organizationId, projectId)}/${automationId}/runs?limit=50`,
    token,
  );
