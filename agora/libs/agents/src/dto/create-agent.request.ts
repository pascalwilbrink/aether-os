import { createZodDto, zCreateAgentRequest } from '@agora/core';

export class CreateAgentRequest extends createZodDto(zCreateAgentRequest) {}
