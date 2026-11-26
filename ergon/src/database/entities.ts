import { InboxMessageEntity, OutboxMessageEntity } from '@aether-os/krepis';

import {
  WorkActivityEntity,
  WorkAssignmentEntity,
  WorkDependencyEntity,
  WorkItemEntity,
} from '../../libs/work-items/src/entities/index.js';

/** Every entity, for the TypeORM CLI and the tests' schema check. */
export const entities = [
  WorkItemEntity,
  WorkAssignmentEntity,
  WorkDependencyEntity,
  WorkActivityEntity,
  OutboxMessageEntity,
  InboxMessageEntity,
];
