import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { InteractionResults } from 'oidc-provider';

import {
  AccountsService,
  InvalidCredentialsError,
  UserDisabledError,
} from '@pistis/users';

import { Public } from '@pistis/core';

import { SignInForm } from './dto/sign-in.form.js';
import { InteractionErrorFilter } from './interaction-error.filter.js';
import { OidcProviderService } from './oidc-provider.service.js';
import { errorPage, signInPage } from './pages.js';
import { PolisDirectory } from './polis-directory.js';
import { organizationOf, requestedResources } from './resources.js';
import {
  UpstreamSignInError,
  UpstreamSignInService,
} from './upstream/upstream-sign-in.service.js';

const OIDC_SCOPES = ['openid', 'offline_access', 'profile', 'email'];

/**
 * Sign-in and consent for oidc-provider's interactions, outside `/v1`
 * (docs/api.md: OIDC endpoints are fixed by the standard).
 *
 * - `login`: the sign-in page: a login and password (`AccountsService`), or
 *   an external OpenID Connect provider (`UpstreamSignInService`), which
 *   comes back to `callback/:provider` and finishes on the interaction's
 *   own URL.
 * - `consent`: no page. Pistis grants the requested scopes, and an
 *   organization resource only to a member of an active organization;
 *   anything else ends the request with `access_denied`.
 */
@Controller('interaction')
@UseFilters(InteractionErrorFilter)
// The sign-in pages: no token yet, by definition.
@Public()
export class InteractionsController {
  constructor(
    private readonly oidc: OidcProviderService,
    private readonly accounts: AccountsService,
    private readonly directory: PolisDirectory,
    private readonly upstream: UpstreamSignInService,
  ) {}

  @Get(':uid')
  async show(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const details = await this.oidc.provider.interactionDetails(req, res);
    if (details.prompt.name === 'login') {
      res.type('html').send(this.signInPage(uid));
      return;
    }
    await this.consent(req, res);
  }

  @Post(':uid/login')
  async login(
    @Param('uid') uid: string,
    @Body() form: SignInForm,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.oidc.provider.interactionDetails(req, res);
    try {
      const user = await this.accounts.signInWithPassword(
        form.login,
        form.password,
      );
      await this.oidc.provider.interactionFinished(
        req,
        res,
        { login: { accountId: user.id } },
        {
          mergeWithLastSubmission: false,
        },
      );
    } catch (error) {
      if (
        error instanceof InvalidCredentialsError ||
        error instanceof UserDisabledError
      ) {
        res
          .status(401)
          .type('html')
          .send(
            this.signInPage(uid, {
              error:
                error instanceof UserDisabledError
                  ? 'This account is disabled.'
                  : 'The login or password is wrong.',
              login: form.login,
            }),
          );
        return;
      }
      throw error;
    }
  }

  /** The fixed redirect URI for every sign-in with `provider`. */
  @Get('callback/:provider')
  async upstreamCallback(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const query = new URL(req.originalUrl, 'http://pistis').searchParams;
    const uid = await this.upstream.interactionOf(
      provider,
      query.get('state') ?? undefined,
    );
    if (!uid) {
      res
        .status(400)
        .type('html')
        .send(errorPage('This sign-in has expired. Please start again.'));
      return;
    }
    // On to the interaction's own URL, where its cookie is sent.
    res.redirect(
      303,
      `/interaction/${encodeURIComponent(uid)}/upstream/${encodeURIComponent(provider)}/callback?${query}`,
    );
  }

  @Get(':uid/upstream/:provider')
  async startUpstream(
    @Param('uid') uid: string,
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.oidc.provider.interactionDetails(req, res);
    try {
      res.redirect(303, (await this.upstream.start(uid, provider)).href);
    } catch (error) {
      this.signInFailed(uid, error, res);
    }
  }

  @Get(':uid/upstream/:provider/callback')
  async finishUpstream(
    @Param('uid') uid: string,
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Throws unless this browser holds interaction `uid`.
    await this.oidc.provider.interactionDetails(req, res);
    try {
      const identity = await this.upstream.complete(
        uid,
        provider,
        new URL(req.originalUrl, 'http://pistis').searchParams,
      );
      const { user } = await this.accounts.resolveSignIn(identity);
      await this.oidc.provider.interactionFinished(
        req,
        res,
        { login: { accountId: user.id } },
        { mergeWithLastSubmission: false },
      );
    } catch (error) {
      this.signInFailed(uid, error, res);
    }
  }

  private signInPage(
    uid: string,
    options: { error?: string; login?: string } = {},
  ): string {
    return signInPage(uid, { ...options, providers: this.upstream.list() });
  }

  /** Back to the sign-in page with what went wrong; anything unexpected rethrows. */
  private signInFailed(uid: string, error: unknown, res: Response): void {
    if (error instanceof UpstreamSignInError) {
      res
        .status(400)
        .type('html')
        .send(this.signInPage(uid, { error: error.message }));
      return;
    }
    if (error instanceof UserDisabledError) {
      res
        .status(401)
        .type('html')
        .send(this.signInPage(uid, { error: 'This account is disabled.' }));
      return;
    }
    throw error;
  }

  private async consent(req: Request, res: Response): Promise<void> {
    const provider = this.oidc.provider;
    const details = await provider.interactionDetails(req, res);
    const accountId = details.session?.accountId;
    const clientId = String(details.params.client_id);
    if (!accountId) {
      await this.deny(req, res, 'not signed in');
      return;
    }

    const resources = requestedResources(details.params.resource);
    for (const resource of resources) {
      const organizationId = organizationOf(resource);
      if (organizationId === undefined) {
        await this.deny(req, res, `unknown resource ${resource}`);
        return;
      }
      if (organizationId) {
        const [roles, status] = await Promise.all([
          this.directory.membershipRoles(accountId, organizationId),
          this.directory.organizationStatus(organizationId),
        ]);
        if (!roles) {
          await this.deny(req, res, 'not a member of the organization');
          return;
        }
        if (status !== 'active') {
          await this.deny(req, res, 'the organization is suspended');
          return;
        }
      }
    }

    const grant = details.grantId
      ? ((await provider.Grant.find(details.grantId)) ??
        new provider.Grant({ accountId, clientId }))
      : new provider.Grant({ accountId, clientId });
    const scope = details.params.scope;
    const requested = typeof scope === 'string' ? scope.split(' ') : [];
    grant.addOIDCScope(
      requested.filter((scope) => OIDC_SCOPES.includes(scope)).join(' '),
    );
    for (const resource of resources) {
      grant.addResourceScope(resource, 'api');
    }
    const grantId = await grant.save();

    const result: InteractionResults = { consent: { grantId } };
    await provider.interactionFinished(req, res, result, {
      mergeWithLastSubmission: true,
    });
  }

  private deny(req: Request, res: Response, reason: string): Promise<void> {
    return this.oidc.provider.interactionFinished(
      req,
      res,
      { error: 'access_denied', error_description: reason },
      { mergeWithLastSubmission: false },
    );
  }
}
