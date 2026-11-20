import { createZodDto, zAgentVersionPage } from '@agora/core';

/** Highest version first. */
export class AgentVersionPage extends createZodDto(zAgentVersionPage) {}
