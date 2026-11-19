// This file is generated from kairos.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `automation.triggered`.
 */
export interface AutomationTriggered {
  automationId: string;
  runId: string;
  /**
   * The event that fired it, e.g. `github.issue.opened`.
   */
  triggerType: string;
  sourceEventId: string;
  webhookDeliveryId: string;
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
