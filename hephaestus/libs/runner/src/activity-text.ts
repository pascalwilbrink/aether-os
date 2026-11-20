/** The most kept of one field of an event (characters). */
export const ACTIVITY_TEXT_LIMIT = 4000;

/**
 * What looks like a credential, replaced before anything is kept: bearer
 * tokens, JWTs, provider keys (`sk-…`, `sk-ant-…`), GitHub tokens, AWS access
 * keys, private keys, and `password=` / `token=`-style assignments.
 */
const SECRETS: [RegExp, string][] = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[redacted private key]',
  ],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]'],
  [
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    '[redacted token]',
  ],
  [/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[redacted key]'],
  [/\b(gh[pousr]|github_pat)_[A-Za-z0-9_]{16,}\b/g, '[redacted token]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted key]'],
  [
    /\b(password|passwd|secret|api[_-]?key|access[_-]?token|token)(["']?\s*[:=]\s*["']?)[^\s"',;&]{4,}/gi,
    '$1$2[redacted]',
  ],
];

export function redact(text: string): string {
  return SECRETS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
}

/** At most `limit` characters, saying how much was left out. */
export function shorten(text: string, limit = ACTIVITY_TEXT_LIMIT): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}… (${text.length - limit} more characters)`;
}

/** A value as it's kept in an event: text as is, anything else as JSON; redacted, then shortened. */
export function excerpt(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value) ?? '';
    } catch {
      text = '(not representable as text)';
    }
  }
  return shorten(redact(text));
}
