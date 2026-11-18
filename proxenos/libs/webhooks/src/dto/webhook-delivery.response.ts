import { createZodDto, zWebhookDeliveryResponse } from '@proxenos/core';

export class WebhookDeliveryResponse extends createZodDto(
  zWebhookDeliveryResponse,
) {}
