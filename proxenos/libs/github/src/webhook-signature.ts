import { createHmac, timingSafeEqual } from 'node:crypto';

/** `sha256=<hex HMAC of the body>`, as GitHub signs webhook deliveries. */
export function webhookSignature(secret: string, body: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** Compares in constant time; anything malformed is simply not valid. */
export function isValidWebhookSignature(
  secret: string,
  body: Buffer,
  signature: string,
): boolean {
  const expected = Buffer.from(webhookSignature(secret, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
