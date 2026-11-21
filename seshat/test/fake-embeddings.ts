import { Embeddings, EmbeddingsError } from '@seshat/knowledge';

/** Words that mean about the same, one dimension each. */
const CONCEPTS = [
  ['car', 'cars', 'automobile', 'automobiles', 'vehicle', 'vehicles'],
  ['deploy', 'deploys', 'release', 'releases', 'rollout', 'ship'],
  ['database', 'databases', 'postgres', 'sql', 'storage'],
  ['money', 'cost', 'costs', 'price', 'budget', 'dollars'],
  ['outage', 'incident', 'downtime', 'failure'],
];
/** Other words spread over these, so unrelated texts barely overlap. */
const OTHER_DIMENSIONS = 32;

/**
 * Pylon's embeddings, as each test sets them up: a vector per text from
 * the concepts its words belong to (so "automobile" is near "car", which
 * keywords miss), and its other words hashed into dimensions of their own.
 * Records every call; `failure` makes the next calls fail.
 */
export class FakeEmbeddings extends Embeddings {
  readonly model = 'openai/fake-embedding';
  readonly calls: {
    organizationId: string;
    projectId: string;
    texts: string[];
  }[] = [];
  failure: EmbeddingsError | null = null;

  embed(
    organizationId: string,
    projectId: string,
    texts: string[],
  ): Promise<number[][]> {
    this.calls.push({ organizationId, projectId, texts });
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    return Promise.resolve(texts.map(vectorOf));
  }
}

function vectorOf(text: string): number[] {
  const vector = Array.from(
    { length: CONCEPTS.length + OTHER_DIMENSIONS },
    () => 0,
  );
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    const concept = CONCEPTS.findIndex((words) => words.includes(word));
    if (concept >= 0) {
      vector[concept] += 3;
    } else {
      let hash = 0;
      for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
      vector[CONCEPTS.length + (hash % OTHER_DIMENSIONS)] += 1;
    }
  }
  // Never all zero: cosine needs a length.
  vector[vector.length - 1] += 0.01;
  return vector;
}
