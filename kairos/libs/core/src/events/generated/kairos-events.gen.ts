// This file is generated from kairos.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `automation.triggered`.
 */
export interface AutomationTriggered {
  automationId: string;
  runId: string;
  /**
   * The event that fired it, e.g. `github.issue.opened` or `ergon.work-assigned`.
   */
  triggerType: string;
  sourceEventId: string;
  /**
   * The GitHub webhook delivery; null for a work assignment.
   */
  webhookDeliveryId: string | null;
}

/** Every Kairos event type, mapped to its payload. */
export interface KairosEventPayloads {
  'automation.triggered': AutomationTriggered;
}

export type KairosEventType = keyof KairosEventPayloads;

/** Every Kairos event type in the spec. */
export const KAIROS_EVENT_TYPES = [
  'automation.triggered',
] as const satisfies readonly KairosEventType[];
