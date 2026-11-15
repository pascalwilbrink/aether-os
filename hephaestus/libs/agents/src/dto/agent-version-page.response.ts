import { createZodDto, zAgentVersionPage } from '@hephaestus/core';

/** Highest version first. */
export class AgentVersionPage extends createZodDto(zAgentVersionPage) {}
