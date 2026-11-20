import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@loculus/core';

import type { FileEntity } from './file.entity.js';
import type { SignedRequest } from './object-storage.js';

/** Where a file's bytes are: Loculus's own IDs, never its name. */
export function objectKeyOf(
  organizationId: string,
  projectId: string,
  fileId: string,
): string {
  return `orgs/${organizationId}/projects/${projectId}/files/${fileId}`;
}

@Injectable()
export class FileMapper {
  toEntity(
    organizationId: string,
    projectId: string,
    request: ApiTypes.CreateFileRequest,
    createdBy: string,
  ): FileEntity {
    const id = uuidv7();
    return {
      id,
      organizationId,
      projectId,
      objectKey: objectKeyOf(organizationId, projectId, id),
      fileName: request.fileName,
      contentType: request.contentType,
      sizeBytes: request.sizeBytes,
      sha256: request.sha256,
      status: 'pending',
      createdBy,
      createdAt: new Date(),
      completedAt: null,
    };
  }

  toResponse(entity: FileEntity): ApiTypes.FileResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      fileName: entity.fileName,
      contentType: entity.contentType,
      sizeBytes: entity.sizeBytes,
      sha256: entity.sha256,
      status: entity.status,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      completedAt: entity.completedAt?.toISOString() ?? null,
    };
  }

  toUpload(signed: SignedRequest): ApiTypes.FileUpload {
    return {
      url: signed.url,
      method: 'PUT',
      headers: signed.headers,
      expiresAt: signed.expiresAt.toISOString(),
    };
  }

  toDownload(signed: SignedRequest): ApiTypes.FileDownload {
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }
}
