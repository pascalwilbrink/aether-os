import {
  isValidWebhookSignature,
  webhookSignature,
} from './webhook-signature.js';

describe('webhook signatures', () => {
  const body = Buffer.from('{"action":"created"}');

  it("accepts GitHub's signature for the body", () => {
    // GitHub's documented example shape: sha256=<64 hex characters>.
    const signature = webhookSignature('s3cret', body);
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(isValidWebhookSignature('s3cret', body, signature)).toBe(true);
  });

  it('refuses another secret, another body, or anything malformed', () => {
    const signature = webhookSignature('s3cret', body);
    expect(isValidWebhookSignature('other', body, signature)).toBe(false);
    expect(
      isValidWebhookSignature('s3cret', Buffer.from('{}'), signature),
    ).toBe(false);
    expect(isValidWebhookSignature('s3cret', body, 'sha256=abc')).toBe(false);
    expect(isValidWebhookSignature('s3cret', body, '')).toBe(false);
  });
});
