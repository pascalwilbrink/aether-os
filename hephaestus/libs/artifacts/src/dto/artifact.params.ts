import { createZodDto, zGetTaskArtifactPath } from '@hephaestus/core';

export class ArtifactParams extends createZodDto(zGetTaskArtifactPath) {}
