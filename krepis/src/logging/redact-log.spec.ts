import { redactText } from './redact-log.js';

describe('redactText', () => {
  it('redacts credentials and email addresses', () => {
    expect(
      redactText(
        'Bearer abc.def and ghp_aaaaaaaaaaaaaaaaaaaaaaaa for ann@example.com',
      ),
    ).toBe('Bearer [redacted] and [redacted token] for [redacted email]');
  });

  it('can keep email addresses, never credentials', () => {
    expect(
      redactText('ann@example.com uses sk-1234567890abcdefgh', {
        keepEmails: true,
      }),
    ).toBe('ann@example.com uses [redacted key]');
  });
});
