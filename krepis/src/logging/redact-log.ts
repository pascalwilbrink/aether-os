/** What every log line is cleaned of (../../../docs/engineering.md, Logging). */
const REDACTED = '[redacted]';

/** Keys whose values are never logged, whatever they hold. */
const SECRET_KEY =
  /^(authorization|proxy-authorization|cookie|set-cookie|password|passphrase|secret|client_?secret|api_?key|x-api-key|token|access_?token|refresh_?token|id_?token|private_?key|credentials?|email)$/i;

/** Secrets that slipped into a message or a value. */
const SECRET_PATTERNS: readonly [RegExp, string][] = [
  [/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]'],
  [/\bbasic\s+[A-Za-z0-9+/=]{8,}/gi, 'Basic [redacted]'],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, '[redacted key]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[redacted token]'],
  [
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g,
    '[redacted jwt]',
  ],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted email]'],
  // Credentials in a URL (postgres://user:password@host).
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, '$1[redacted]@'],
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * `text` with credentials redacted (bearer and basic credentials, JWTs,
 * provider keys, GitHub tokens, passwords in URLs), and email addresses
 * unless `keepEmails` (text people wrote for others to read, such as
 * project knowledge, may name a contact).
 */
export function redactText(
  text: string,
  options: { keepEmails?: boolean } = {},
): string {
  return SECRET_PATTERNS.reduce(
    (result, [pattern, replacement]) =>
      options.keepEmails && pattern.source === EMAIL.source
        ? result
        : result.replace(pattern, replacement),
    text,
  );
}

/**
 * `value` with secret keys' values replaced and secret-looking text
 * redacted, at any depth. Never changes `value` itself.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth > 8) {
    return '[too deep]';
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      ...(value.stack ? { stack: redactText(value.stack) } : {}),
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (value instanceof Date) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? REDACTED : redactValue(item, depth + 1),
    ]),
  );
}

/** Whether a key's value is never logged. */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}
