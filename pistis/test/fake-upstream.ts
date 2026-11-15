import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export interface UpstreamAccount {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

interface IssuedCode {
  account: UpstreamAccount;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
}

/**
 * A minimal external OpenID Connect provider for tests: discovery, JWKS, an
 * authorization endpoint that signs in `nextAccount` (or answers
 * `nextError`) without a page, and a token endpoint that checks the client
 * secret, PKCE and the redirect URI and returns an ES256 ID token.
 */
export class FakeUpstream {
  static readonly CLIENT_ID = 'pistis';
  static readonly CLIENT_SECRET = 'upstream-client-secret';

  nextAccount: UpstreamAccount = {
    sub: 'upstream-1',
    email: 'ada@example.com',
    email_verified: true,
    name: 'Ada Lovelace',
  };
  nextError: string | null = null;
  /** Replaces the ID token's nonce, to test that Pistis checks it. */
  nonceOverride: string | null = null;
  tokenRequests = 0;

  private readonly codes = new Map<string, IssuedCode>();
  private server: Server | undefined;
  private keys: Awaited<ReturnType<typeof generateKeyPair>> | undefined;
  issuer = '';

  async start(): Promise<this> {
    this.keys = await generateKeyPair('ES256', { extractable: true });
    this.server = createServer((req, res) => {
      this.handle(
        req.url ?? '/',
        req.method ?? 'GET',
        req.headers.authorization,
        req,
      )
        .then(({ status, headers, body }) => {
          res.writeHead(status, headers);
          res.end(body);
        })
        .catch((error: unknown) => {
          res.writeHead(500);
          res.end(String(error));
        });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    this.server.unref();
    this.issuer = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  reset(): void {
    this.nextAccount = {
      sub: 'upstream-1',
      email: 'ada@example.com',
      email_verified: true,
      name: 'Ada Lovelace',
    };
    this.nextError = null;
    this.nonceOverride = null;
    this.tokenRequests = 0;
    this.codes.clear();
  }

  private async handle(
    rawUrl: string,
    method: string,
    authorization: string | undefined,
    req: NodeJS.ReadableStream,
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }> {
    const url = new URL(rawUrl, this.issuer);
    const json = (status: number, body: unknown) => ({
      status,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (url.pathname === '/.well-known/openid-configuration') {
      return json(200, {
        issuer: this.issuer,
        authorization_endpoint: `${this.issuer}/authorize`,
        token_endpoint: `${this.issuer}/token`,
        jwks_uri: `${this.issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['ES256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: [
          'client_secret_basic',
          'client_secret_post',
        ],
      });
    }
    if (url.pathname === '/jwks') {
      return json(200, {
        keys: [
          {
            ...(await exportJWK(this.keys!.publicKey)),
            kid: 'up-1',
            alg: 'ES256',
            use: 'sig',
          },
        ],
      });
    }
    if (url.pathname === '/authorize') {
      const params = url.searchParams;
      const redirect = new URL(params.get('redirect_uri')!);
      redirect.searchParams.set('state', params.get('state') ?? '');
      if (this.nextError) {
        redirect.searchParams.set('error', this.nextError);
      } else {
        const code = randomUUID();
        this.codes.set(code, {
          account: this.nextAccount,
          nonce: params.get('nonce') ?? '',
          codeChallenge: params.get('code_challenge') ?? '',
          redirectUri: params.get('redirect_uri')!,
        });
        redirect.searchParams.set('code', code);
      }
      return { status: 302, headers: { location: redirect.href }, body: '' };
    }
    if (url.pathname === '/token' && method === 'POST') {
      this.tokenRequests++;
      const form = new URLSearchParams(await readBody(req));
      const [id, secret] = authorization?.startsWith('Basic ')
        ? Buffer.from(authorization.slice(6), 'base64')
            .toString()
            .split(':')
            .map(decodeURIComponent)
        : [form.get('client_id'), form.get('client_secret')];
      if (
        id !== FakeUpstream.CLIENT_ID ||
        secret !== FakeUpstream.CLIENT_SECRET
      ) {
        return json(401, { error: 'invalid_client' });
      }
      const issued = this.codes.get(form.get('code') ?? '');
      this.codes.delete(form.get('code') ?? '');
      const challenge = createHash('sha256')
        .update(form.get('code_verifier') ?? '')
        .digest('base64url');
      if (
        !issued ||
        challenge !== issued.codeChallenge ||
        form.get('redirect_uri') !== issued.redirectUri
      ) {
        return json(400, { error: 'invalid_grant' });
      }
      const idToken = await new SignJWT({
        ...issued.account,
        nonce: this.nonceOverride ?? issued.nonce,
      })
        .setProtectedHeader({ alg: 'ES256', kid: 'up-1' })
        .setIssuer(this.issuer)
        .setAudience(FakeUpstream.CLIENT_ID)
        .setSubject(issued.account.sub)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(this.keys!.privateKey);
      return json(200, {
        access_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken,
      });
    }
    return json(404, { error: 'not_found' });
  }
}

async function readBody(req: NodeJS.ReadableStream): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += String(chunk);
  }
  return body;
}

/** The test file's upstream, started by test/setup.ts. */
export const upstream = new FakeUpstream();
