import { OutboxMessageEntity } from '@aether-os/krepis';

import { AgentVersionEntity } from '../../libs/agents/src/agent-version.entity.js';
import { AgentEntity } from '../../libs/agents/src/agent.entity.js';
import { CouncilVersionEntity } from '../../libs/councils/src/council-version.entity.js';
import { CouncilEntity } from '../../libs/councils/src/council.entity.js';
import { SkillVersionEntity } from '../../libs/skills/src/skill-version.entity.js';
import { SkillEntity } from '../../libs/skills/src/skill.entity.js';

/** Every entity, for the TypeORM CLI and the tests' schema check. */
export const entities = [
  AgentEntity,
  AgentVersionEntity,
  SkillEntity,
  SkillVersionEntity,
  CouncilEntity,
  CouncilVersionEntity,
  OutboxMessageEntity,
];
