import { createZodDto, zListSessionsPath } from '@hephaestus/core';

export class SessionsParams extends createZodDto(zListSessionsPath) {}
