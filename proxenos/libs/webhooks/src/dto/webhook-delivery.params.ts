import { createZodDto, zGetWebhookDeliveryPath } from '@proxenos/core';

/** `:organizationId` and `:deliveryId` (the stored delivery's, a UUID). */
export class WebhookDeliveryParams extends createZodDto(
  zGetWebhookDeliveryPath,
) {}
