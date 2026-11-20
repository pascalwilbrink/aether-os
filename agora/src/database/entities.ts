import { OutboxMessageEntity } from '@aether-os/krepis';

import { AgentVersionEntity } from '../../libs/agents/src/agent-version.entity.js';
import { AgentEntity } from '../../libs/agents/src/agent.entity.js';

/** Every entity, for the TypeORM CLI and the tests' schema check. */
export const entities = [AgentEntity, AgentVersionEntity, OutboxMessageEntity];
