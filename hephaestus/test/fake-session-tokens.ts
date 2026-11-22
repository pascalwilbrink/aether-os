import { ForbiddenException } from '@nestjs/common';

import { SessionTokens, type SessionTokenRequest } from '@hephaestus/sessions';

/** Session tokens without Pistis: records each request; `refuse` to say no. */
export class FakeSessionTokens extends SessionTokens {
  readonly requests: SessionTokenRequest[] = [];
  refuse = false;

  issue(request: SessionTokenRequest): Promise<string> {
    this.requests.push(request);
    if (this.refuse) {
      return Promise.reject(
        new ForbiddenException(
          'Pistis refused a session token (invalid_target).',
        ),
      );
    }
    return Promise.resolve(`session-token-${this.requests.length}`);
  }
}
