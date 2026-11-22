import { createZodDto, zGetSessionPath } from '@hephaestus/core';

export class SessionParams extends createZodDto(zGetSessionPath) {}
