import { InboxMessageEntity, OutboxMessageEntity } from '@aether-os/krepis';

import {
  KnowledgeAuditEntity,
  KnowledgeResourceEntity,
  KnowledgeReviewEntity,
  KnowledgeVersionEntity,
} from '../../libs/knowledge/src/entities/index.js';
import { PersonEntity } from '../../libs/persons/src/person.entity.js';

/** Every entity, for the TypeORM CLI and the tests' schema check. */
export const entities = [
  KnowledgeResourceEntity,
  KnowledgeVersionEntity,
  KnowledgeReviewEntity,
  KnowledgeAuditEntity,
  PersonEntity,
  OutboxMessageEntity,
  InboxMessageEntity,
];
