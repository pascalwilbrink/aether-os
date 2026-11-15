import { createZodDto, zCreateAgentRequest } from '@hephaestus/core';

export class CreateAgentRequest extends createZodDto(zCreateAgentRequest) {}
