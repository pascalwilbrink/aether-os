import { createZodDto, zListTaskArtifactsPath } from '@hephaestus/core';

export class ArtifactsParams extends createZodDto(zListTaskArtifactsPath) {}
