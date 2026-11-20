import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import {
  PlatformAccess,
  RequirePermission,
  ZodSerializerDto,
} from '@loculus/core';

import {
  CreatedFileResponse,
  CreateFileRequest,
  FileDownload,
  FilePage,
  FileParams,
  FileResponse,
  FilesParams,
  FileUpload,
  ListFilesQuery,
} from './dto/file.dto.js';
import { FilesService } from './files.service.js';

const IN_PROJECT = { project: 'projectId' };

/** A project's files (docs/files.md). */
@Controller('organizations/:organizationId/projects/:projectId/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @RequirePermission('file:write', IN_PROJECT)
  @ZodSerializerDto(CreatedFileResponse)
  create(
    @Param() { organizationId, projectId }: FilesParams,
    @Body() body: CreateFileRequest,
  ) {
    return this.files.create(organizationId, projectId, body);
  }

  @Get()
  @RequirePermission('file:read', IN_PROJECT)
  @ZodSerializerDto(FilePage)
  list(
    @Param() { organizationId, projectId }: FilesParams,
    @Query() query: ListFilesQuery,
  ) {
    return this.files.list(organizationId, projectId, query);
  }

  @Get(':fileId')
  @RequirePermission('file:read', IN_PROJECT)
  // Platform services read files too (Seshat indexes a project's documents).
  @PlatformAccess('platform:read')
  @ZodSerializerDto(FileResponse)
  get(@Param() { organizationId, projectId, fileId }: FileParams) {
    return this.files.get(organizationId, projectId, fileId);
  }

  @Get(':fileId/upload')
  @RequirePermission('file:write', IN_PROJECT)
  @ZodSerializerDto(FileUpload)
  upload(@Param() { organizationId, projectId, fileId }: FileParams) {
    return this.files.upload(organizationId, projectId, fileId);
  }

  @Post(':fileId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('file:write', IN_PROJECT)
  @ZodSerializerDto(FileResponse)
  complete(@Param() { organizationId, projectId, fileId }: FileParams) {
    return this.files.complete(organizationId, projectId, fileId);
  }

  @Get(':fileId/download')
  @RequirePermission('file:read', IN_PROJECT)
  @PlatformAccess('platform:read')
  @ZodSerializerDto(FileDownload)
  download(@Param() { organizationId, projectId, fileId }: FileParams) {
    return this.files.download(organizationId, projectId, fileId);
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('file:write', IN_PROJECT)
  async delete(@Param() { organizationId, projectId, fileId }: FileParams) {
    await this.files.delete(organizationId, projectId, fileId);
  }
}
