import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  mapPage,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@loculus/core';

import { FileEntity, type FileStatus } from './file.entity.js';
import {
  FileNotAvailableError,
  FileNotPendingError,
  FileTooLargeError,
  FileUploadIncompleteError,
} from './file.errors.js';
import { FileMapper } from './file.mapper.js';
import { FILES_OPTIONS, type FilesOptions } from './files.options.js';
import { ObjectStorage, StorageUnavailableError } from './object-storage.js';

/**
 * A project's files (docs/files.md): declared, uploaded straight to the
 * storage with a signed URL, completed once the storage holds exactly what
 * was declared, downloaded with a signed URL. The route checks the
 * permission in the project; everything here is looked up within it, so
 * another project's file is a 404.
 */
@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileEntity)
    private readonly files: Repository<FileEntity>,
    private readonly mapper: FileMapper,
    private readonly storage: ObjectStorage,
    private readonly access: AccessControl,
    @Inject(FILES_OPTIONS) private readonly options: FilesOptions,
  ) {}

  async create(
    organizationId: string,
    projectId: string,
    request: ApiTypes.CreateFileRequest,
  ): Promise<ApiTypes.CreatedFileResponse> {
    if (request.sizeBytes > this.options.maxBytes) {
      throw new FileTooLargeError(request.sizeBytes, this.options.maxBytes);
    }
    const entity = this.mapper.toEntity(
      organizationId,
      projectId,
      request,
      this.access.principal().sub,
    );
    const upload = await this.signUpload(entity);
    await this.files.insert(entity);
    return { file: this.mapper.toResponse(entity), upload };
  }

  async list(
    organizationId: string,
    projectId: string,
    query: PageRequest & { status?: FileStatus },
  ): Promise<Page<ApiTypes.FileResponse>> {
    const page = await findPage(
      this.files,
      {
        where: {
          organizationId,
          projectId,
          ...(query.status ? { status: query.status } : {}),
        },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      query,
    );
    return mapPage(page, (entity) => this.mapper.toResponse(entity));
  }

  async get(
    organizationId: string,
    projectId: string,
    fileId: string,
  ): Promise<ApiTypes.FileResponse> {
    return this.mapper.toResponse(
      await this.find(organizationId, projectId, fileId),
    );
  }

  /** A fresh upload for a file still pending (the first one expired). */
  async upload(
    organizationId: string,
    projectId: string,
    fileId: string,
  ): Promise<ApiTypes.FileUpload> {
    const entity = await this.find(organizationId, projectId, fileId);
    if (entity.status !== 'pending') {
      throw new FileNotPendingError(fileId);
    }
    return this.signUpload(entity);
  }

  /**
   * Makes it available once the storage holds exactly what was declared
   * (idempotent). Otherwise it stays pending, to be uploaded again.
   */
  async complete(
    organizationId: string,
    projectId: string,
    fileId: string,
  ): Promise<ApiTypes.FileResponse> {
    const entity = await this.find(organizationId, projectId, fileId);
    if (entity.status === 'available') {
      return this.mapper.toResponse(entity);
    }
    const stored = await this.unlessUnavailable(() =>
      this.storage.inspect(entity.objectKey),
    );
    if (!stored) {
      throw new FileUploadIncompleteError(fileId, 'nothing was uploaded');
    }
    if (stored.sizeBytes !== entity.sizeBytes) {
      throw new FileUploadIncompleteError(
        fileId,
        `${stored.sizeBytes} bytes were uploaded, ${entity.sizeBytes} declared`,
      );
    }
    if (stored.sha256 !== entity.sha256) {
      throw new FileUploadIncompleteError(
        fileId,
        "the uploaded bytes don't match the declared SHA-256",
      );
    }
    entity.status = 'available';
    entity.completedAt = new Date();
    await this.files.update(
      { id: entity.id, status: 'pending' },
      { status: entity.status, completedAt: entity.completedAt },
    );
    return this.mapper.toResponse(entity);
  }

  async download(
    organizationId: string,
    projectId: string,
    fileId: string,
  ): Promise<ApiTypes.FileDownload> {
    const entity = await this.find(organizationId, projectId, fileId);
    if (entity.status !== 'available') {
      throw new FileNotAvailableError(fileId);
    }
    return this.mapper.toDownload(
      await this.storage.signDownload(
        entity.objectKey,
        entity.fileName,
        this.options.downloadTtlSeconds,
      ),
    );
  }

  /** Removes the object, then the file (idempotent). */
  async delete(
    organizationId: string,
    projectId: string,
    fileId: string,
  ): Promise<void> {
    const entity = await this.files.findOneBy({
      id: fileId,
      organizationId,
      projectId,
    });
    if (!entity) {
      return;
    }
    await this.unlessUnavailable(() => this.storage.delete(entity.objectKey));
    await this.files.delete({ id: entity.id });
  }

  private async find(
    organizationId: string,
    projectId: string,
    fileId: string,
  ): Promise<FileEntity> {
    const entity = await this.files.findOneBy({
      id: fileId,
      organizationId,
      projectId,
    });
    if (!entity) {
      throw new NotFoundException(`File ${fileId} not found`);
    }
    return entity;
  }

  private async signUpload(entity: FileEntity): Promise<ApiTypes.FileUpload> {
    return this.mapper.toUpload(
      await this.storage.signUpload(
        entity.objectKey,
        {
          contentType: entity.contentType,
          sizeBytes: entity.sizeBytes,
          sha256: entity.sha256,
        },
        this.options.uploadTtlSeconds,
      ),
    );
  }

  /** The storage not answering is a 503 (safe to retry). */
  private async unlessUnavailable<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        throw new ServiceUnavailableException(
          "Files can't be reached right now: the object store isn't answering. Try again in a moment.",
          { cause: error },
        );
      }
      throw error;
    }
  }
}
