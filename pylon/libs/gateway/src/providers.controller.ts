import { Controller, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AccessControl, Authenticated } from '@pylon/core';

import { modelCallContext } from './call-context.js';
import { PassThroughService } from './pass-through.service.js';

/**
 * Model calls in each provider's own API, passed through
 * (`/v1/providers/<provider>/<path>`, docs/pylon.md). Only task and session
 * tokens, with `model:invoke` in their project (a session token's rests on
 * the person's `session:use`, Krepis); the token may come where the provider's
 * SDK puts its key (`ProviderKeyHeaders`).
 */
@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly passThrough: PassThroughService,
    private readonly access: AccessControl,
  ) {}

  @Post(':provider/*path')
  @Authenticated()
  async call(
    @Param('provider') provider: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const context = modelCallContext(this.access.principal(), request.headers);
    this.access.assertProjectPermission(context.projectId, 'model:invoke');
    const segments = (request.params as { path?: string | string[] }).path;
    const path = Array.isArray(segments)
      ? segments.join('/')
      : (segments ?? '');
    await this.passThrough.call(context, provider, path, request, response);
  }
}
