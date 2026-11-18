import { createZodDto, zListTaskArtifactsQuery } from '@hephaestus/core';

export class ListArtifactsQuery extends createZodDto(zListTaskArtifactsQuery) {}
