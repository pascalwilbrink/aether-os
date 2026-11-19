import { redactUrl } from './redact.js';

describe('redactUrl', () => {
  it('keeps the path and the query keys, never their values', () => {
    expect(redactUrl('/oidc/callback?code=abc&state=xyz')).toBe(
      '/oidc/callback?code=redacted&state=redacted',
    );
    expect(
      redactUrl('https://api.github.com/repos/a/b?access_token=ghs_123&flag'),
    ).toBe('https://api.github.com/repos/a/b?access_token=redacted&flag');
    expect(redactUrl('/v1/organizations/1/tasks')).toBe(
      '/v1/organizations/1/tasks',
    );
  });
});
