import { createZodDto, zUpdateModelRequest } from '@hephaestus/core';

/** PUT: every editable field, replaced as a whole. */
export class UpdateModelRequest extends createZodDto(zUpdateModelRequest) {}
