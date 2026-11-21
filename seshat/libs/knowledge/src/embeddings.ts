/** Why texts couldn't be embedded, and whether trying again soon may help. */
export class EmbeddingsError extends Error {
  constructor(
    message: string,
    /** False when only a change of configuration helps (no key, no such model). */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EmbeddingsError';
  }
}

/**
 * Embedding texts for a project, through Pylon (`HttpEmbeddings`, with
 * Seshat's own token, charged to the project; ../../../../docs/pylon.md).
 * `model` is `<provider>/<model>`; one vector per text, in order. `null`
 * when no Pylon is configured (`NoEmbeddings`): search is by keyword only.
 */
export abstract class Embeddings {
  abstract readonly model: string | null;

  abstract embed(
    organizationId: string,
    projectId: string,
    texts: string[],
  ): Promise<number[][]>;
}

/** No Pylon: nothing is embedded. */
export class NoEmbeddings extends Embeddings {
  readonly model = null;

  embed(): Promise<number[][]> {
    return Promise.reject(
      new EmbeddingsError('No Pylon is configured (PYLON_URL)', false),
    );
  }
}
