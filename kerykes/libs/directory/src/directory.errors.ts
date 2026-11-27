/** Polis, Pistis or Ergon couldn't be asked; the event is retried later. */
export class DirectoryUnavailableError extends Error {
  constructor(service: 'Polis' | 'Pistis' | 'Ergon', reason: string) {
    super(`${service} can't be reached right now (${reason})`);
    this.name = 'DirectoryUnavailableError';
  }
}
