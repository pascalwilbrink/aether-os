/** Neither the organization nor (if allowed) the platform has a key. */
export class ModelKeyMissingError extends Error {
  constructor(readonly provider: string) {
    super(
      `No key for model provider ${provider}: store one at orgs/<organizationId>/llm/${provider} in OpenBao`,
    );
    this.name = 'ModelKeyMissingError';
  }
}
