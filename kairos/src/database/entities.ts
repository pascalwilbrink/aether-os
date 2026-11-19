import { InboxMessageEntity, OutboxMessageEntity } from '@aether-os/krepis';

import { AutomationRunEntity } from '../../libs/automations/src/automation-run.entity.js';
import { AutomationEntity } from '../../libs/automations/src/automation.entity.js';

/** Every entity, for the TypeORM CLI and the tests' schema check. */
export const entities = [
  AutomationEntity,
  AutomationRunEntity,
  OutboxMessageEntity,
  InboxMessageEntity,
];
