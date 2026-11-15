import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { errors } from 'oidc-provider';

import { errorPage } from './pages.js';

/**
 * oidc-provider's errors on the interaction pages (an expired or unknown
 * interaction, a missing cookie: another browser) as an HTML page, since a
 * person is looking at it, rather than Krepis's JSON problem details.
 */
@Catch(errors.OIDCProviderError)
export class InteractionErrorFilter implements ExceptionFilter {
  catch(error: errors.OIDCProviderError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const message =
      error instanceof errors.SessionNotFound ||
      error instanceof errors.InvalidRequest
        ? 'This sign-in has expired or was started in another browser. Please start again from the application.'
        : (error.error_description ?? error.message);
    res.status(error.status).type('html').send(errorPage(message));
  }
}
