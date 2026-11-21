export const KNOWLEDGE_OPTIONS = Symbol('KNOWLEDGE_OPTIONS');

export interface KnowledgeOptions {
  /** How often the indexer looks for documents (ms); 0 turns it off. */
  indexerIntervalMs: number;
  /** The largest document read to index (bytes). */
  documentMaxBytes: number;
  /** How often the embedder looks for passages (ms); 0 turns it off. */
  embedderIntervalMs: number;
  /** The least cosine similarity a passage needs to match by meaning. */
  searchMinSimilarity: number;
}
