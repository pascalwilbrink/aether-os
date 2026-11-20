import { Initial1795200018678 } from './1795200018678-Initial.js';
import { ModelCatalogSeed1795200018679 } from './1795200018679-ModelCatalogSeed.js';
import { OpenAiModelsSeed1795200018680 } from './1795200018680-OpenAiModelsSeed.js';
import { EmbeddingModelsSeed1795200018681 } from './1795200018681-EmbeddingModelsSeed.js';

/** Every migration, oldest first. */
export const migrations = [
  Initial1795200018678,
  ModelCatalogSeed1795200018679,
  OpenAiModelsSeed1795200018680,
  EmbeddingModelsSeed1795200018681,
];
