/**
 * Why a request got no answer, for logs and `503` details: `fetch` throws
 * `TypeError: fetch failed` and keeps the reason (`ECONNREFUSED
 * 127.0.0.1:3001`, a DNS failure) in its `cause`; a timeout is a
 * `TimeoutError`.
 *
 * Generated clients (`@hey-api/client-fetch`) don't throw a failed fetch:
 * they return it as `error` with no `response`. Pass that `error` here.
 */
export function fetchFailure(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return `no answer in time (${error.message})`;
    }
    const cause = error.cause;
    if (cause instanceof Error) {
      const code = (cause as { code?: unknown }).code;
      return `${error.message}: ${typeof code === 'string' && !cause.message.includes(code) ? `${code} ` : ''}${cause.message}`;
    }
    return error.message;
  }
  if (error === undefined || error === null) {
    return 'no response';
  }
  return typeof error === 'string' ? error : JSON.stringify(error);
}
