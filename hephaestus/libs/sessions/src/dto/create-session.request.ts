import { createZodDto, zCreateSessionRequest } from '@hephaestus/core';

export class CreateSessionRequest extends createZodDto(zCreateSessionRequest) {}
