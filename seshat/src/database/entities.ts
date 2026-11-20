import { OutboxMessageEntity } from '@aether-os/krepis';

import { KnowledgeChunkEntity } from '../../libs/knowledge/src/knowledge-chunk.entity.js';
import { KnowledgeItemVersionEntity } from '../../libs/knowledge/src/knowledge-item-version.entity.js';
import { KnowledgeItemEntity } from '../../libs/knowledge/src/knowledge-item.entity.js';

/** Every entity, for the TypeORM CLI and the tests' schema check. */
export const entities = [
  KnowledgeItemEntity,
  KnowledgeItemVersionEntity,
  KnowledgeChunkEntity,
  OutboxMessageEntity,
];
