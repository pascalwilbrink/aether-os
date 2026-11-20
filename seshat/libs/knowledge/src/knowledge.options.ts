export const KNOWLEDGE_OPTIONS = Symbol('KNOWLEDGE_OPTIONS');

export interface KnowledgeOptions {
  /** How often the indexer looks for documents (ms); 0 turns it off. */
  indexerIntervalMs: number;
  /** The largest document read to index (bytes). */
  documentMaxBytes: number;
}
