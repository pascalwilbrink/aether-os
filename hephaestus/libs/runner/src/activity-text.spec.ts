import { excerpt, redact, shorten } from './activity-text.js';

describe('activity text', () => {
  it('redacts what looks like a credential', () => {
    expect(redact('curl -H "Authorization: Bearer abcdefgh12345678"')).toBe(
      'curl -H "Authorization: Bearer [redacted]"',
    );
    expect(redact('key sk-ant-api03-abcdefghijklmnop end')).toBe(
      'key [redacted key] end',
    );
    expect(redact('ghp_0123456789abcdefghij and AKIAABCDEFGHIJKLMNOP')).toBe(
      '[redacted token] and [redacted key]',
    );
    expect(
      redact('jwt eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXg'),
    ).toBe('jwt [redacted token]');
    expect(redact('PASSWORD=hunter22 api_key: "abcd1234"')).toBe(
      'PASSWORD=[redacted] api_key: "[redacted]"',
    );
    expect(
      redact(
        '-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----',
      ),
    ).toBe('[redacted private key]');
    expect(redact('ls -la /workspace')).toBe('ls -la /workspace');
  });

  it('shortens long text and says how much is missing', () => {
    expect(shorten('abcdef', 4)).toBe('abcd… (2 more characters)');
    expect(shorten('abc', 4)).toBe('abc');
  });

  it('keeps values as text or JSON', () => {
    expect(excerpt({ command: 'echo hi' })).toBe('{"command":"echo hi"}');
    expect(excerpt('plain')).toBe('plain');
    expect(excerpt(undefined)).toBeNull();
    expect(excerpt({ token: 'abcdefgh' })).toBe('{"token":"[redacted]"}');
  });
});
