/**
 * Pistis's own pages: sign-in and errors. Plain server-rendered HTML with no
 * scripts or external assets; Iris can take over the look later.
 */
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Aether-os</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f6f6f8; color: #1d1d22; }
  main { background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 1px 4px #0002; width: min(22rem, 90vw); }
  h1 { font-size: 1.25rem; margin: 0 0 1.25rem; }
  label { display: block; margin: 0 0 .75rem; font-size: .9rem; }
  input { display: block; width: 100%; box-sizing: border-box; margin-top: .25rem; padding: .55rem; font: inherit; border: 1px solid #c8c8d0; border-radius: 6px; }
  button { width: 100%; padding: .6rem; font: inherit; border: 0; border-radius: 6px; background: #3b46d6; color: #fff; cursor: pointer; }
  .error { color: #b3261e; margin: 0 0 1rem; }
  .providers { display: grid; gap: .5rem; }
  .provider { display: block; padding: .6rem; text-align: center; border: 1px solid #c8c8d0; border-radius: 6px; color: inherit; text-decoration: none; }
  .or { text-align: center; color: #888; margin: 1rem 0; font-size: .9rem; }
  @media (prefers-color-scheme: dark) { body { background: #16161a; color: #ececf1; } main { background: #222228; } input { background: #16161a; color: inherit; border-color: #444; } }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export interface SignInPageOptions {
  error?: string;
  login?: string;
  /** External providers to offer, each a button. */
  providers?: { id: string; name: string }[];
}

export function signInPage(
  uid: string,
  options: SignInPageOptions = {},
): string {
  const providers = (options.providers ?? [])
    .map(
      (provider) =>
        `<a class="provider" href="/interaction/${escape(uid)}/upstream/${encodeURIComponent(provider.id)}">Sign in with ${escape(provider.name)}</a>`,
    )
    .join('\n');

  return page(
    'Sign in',
    `<h1>Sign in to Aether-os</h1>
${options.error ? `<p class="error" role="alert">${escape(options.error)}</p>` : ''}
${providers ? `<nav class="providers">${providers}</nav><p class="or">or</p>` : ''}
<form method="post" action="/interaction/${escape(uid)}/login">
  <label>Email or login<input name="login" autocomplete="username" required value="${escape(options.login ?? '')}"></label>
  <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Sign in</button>
</form>`,
  );
}

export function errorPage(message: string): string {
  return page(
    'Something went wrong',
    `<h1>Something went wrong</h1><p class="error">${escape(message)}</p>`,
  );
}
