import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * On `/v1/providers/…`, the token may come where the provider's SDK puts
 * its API key (`x-api-key` for Anthropic, `x-goog-api-key` for Google), so
 * SDKs work unchanged with Pylon's URL: it's moved to `Authorization`
 * before Krepis's guard reads it. A bearer token sent as well wins.
 */
@Injectable()
export class ProviderKeyHeaders implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    if (!request.headers.authorization) {
      const key =
        request.headers['x-api-key'] ?? request.headers['x-goog-api-key'];
      const value = Array.isArray(key) ? key[0] : key;
      if (value) {
        request.headers.authorization = `Bearer ${value}`;
      }
    }
    delete request.headers['x-api-key'];
    delete request.headers['x-goog-api-key'];
    next();
  }
}
