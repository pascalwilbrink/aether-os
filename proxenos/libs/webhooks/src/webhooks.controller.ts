import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  PlatformAccess,
  Public,
  RequirePermission,
  ZodSerializerDto,
} from '@proxenos/core';

import { WebhookDeliveryParams } from './dto/webhook-delivery.params.js';
import { WebhookDeliveryResponse } from './dto/webhook-delivery.response.js';
import { WebhooksService } from './webhooks.service.js';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('github')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  async github(@Req() request: RawBodyRequest<Request>): Promise<void> {
    const header = (name: string) => {
      const value = request.headers[name];
      return typeof value === 'string' && value.length <= 200 ? value : null;
    };
    const event = header('x-github-event');
    const deliveryId = header('x-github-delivery');
    const signature = header('x-hub-signature-256');
    if (!event || !deliveryId || !signature || !request.rawBody) {
      throw new UnauthorizedException('Not a signed GitHub delivery');
    }
    await this.webhooks.receive({
      event,
      deliveryId,
      signature,
      rawBody: request.rawBody,
    });
  }
}

/**
 * A stored delivery with its full payload (what events leave out, such as
 * an issue's body): the organization's members, and Kairos (a platform
 * service) with `platform:read`.
 */
@Controller('organizations/:organizationId/webhook-deliveries')
export class WebhookDeliveriesController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get(':deliveryId')
  @RequirePermission('org:read')
  @PlatformAccess('platform:read')
  @ZodSerializerDto(WebhookDeliveryResponse)
  findById(@Param() { organizationId, deliveryId }: WebhookDeliveryParams) {
    return this.webhooks.findById(organizationId, deliveryId);
  }
}
