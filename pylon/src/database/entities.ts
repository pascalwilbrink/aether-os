import { InboxMessageEntity, OutboxMessageEntity } from '@aether-os/krepis';

import { AgentEntity } from '../../libs/agents/src/agent.entity.js';
import { ModelPriceEntity } from '../../libs/catalog/src/model-price.entity.js';
import { ModelEntity } from '../../libs/catalog/src/model.entity.js';
import { ModelKeyEntity } from '../../libs/keys/src/model-key.entity.js';
import { BudgetEntity } from '../../libs/usage/src/budget.entity.js';
import { ModelCallEntity } from '../../libs/usage/src/model-call.entity.js';

/** Every entity, for the TypeORM CLI and the tests' schema check. */
export const entities = [
  AgentEntity,
  ModelEntity,
  ModelPriceEntity,
  ModelKeyEntity,
  ModelCallEntity,
  BudgetEntity,
  OutboxMessageEntity,
  InboxMessageEntity,
];
