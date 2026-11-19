/**
 * A URL (or path) with every query value replaced: query strings carry
 * authorization codes, states and sometimes tokens, which never belong in a
 * span. Keys stay, so the shape of the request is still visible.
 */
export function redactUrl(url: string): string {
  const at = url.indexOf('?');
  if (at < 0) {
    return url;
  }
  const query = url
    .slice(at + 1)
    .split('&')
    .map((pair) => {
      const key = pair.split('=')[0];
      return pair.includes('=') ? `${key}=redacted` : key;
    })
    .join('&');
  return `${url.slice(0, at)}?${query}`;
}
