/** Providers whose models aren't in the catalogue: servers organizations run. */
export const SELF_HOSTED_PROVIDERS: readonly string[] = ['ollama'];

export const isSelfHosted = (provider: string) =>
  SELF_HOSTED_PROVIDERS.includes(provider);
