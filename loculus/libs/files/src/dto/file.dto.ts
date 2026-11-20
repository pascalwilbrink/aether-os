import {
  createZodDto,
  zCreatedFileResponse,
  zCreateFileRequest,
  zFileDownload,
  zFilePage,
  zFileResponse,
  zFileUpload,
  zGetFilePath,
  zListFilesPath,
  zListFilesQuery,
} from '@loculus/core';

/** `:organizationId` and `:projectId`. */
export class FilesParams extends createZodDto(zListFilesPath) {}
/** `:organizationId`, `:projectId` and `:fileId`. */
export class FileParams extends createZodDto(zGetFilePath) {}
export class ListFilesQuery extends createZodDto(zListFilesQuery) {}
export class CreateFileRequest extends createZodDto(zCreateFileRequest) {}
export class CreatedFileResponse extends createZodDto(zCreatedFileResponse) {}
export class FileResponse extends createZodDto(zFileResponse) {}
export class FileUpload extends createZodDto(zFileUpload) {}
export class FileDownload extends createZodDto(zFileDownload) {}
export class FilePage extends createZodDto(zFilePage) {}
