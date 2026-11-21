import { Module, Optional, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { HealthRegistry, type Env } from '@loculus/core';

import { FileEntity } from './file.entity.js';
import { FileMapper } from './file.mapper.js';
import { FilesController } from './files.controller.js';
import { FILES_OPTIONS, type FilesOptions } from './files.options.js';
import { FilesService } from './files.service.js';
import { ObjectStorage } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';

@Module({
  imports: [TypeOrmModule.forFeature([FileEntity])],
  controllers: [FilesController],
  providers: [
    FilesService,
    FileMapper,
    {
      provide: FILES_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): FilesOptions => ({
        maxBytes: config.get('FILE_MAX_BYTES', { infer: true }),
        uploadTtlSeconds: config.get('UPLOAD_URL_TTL_SECONDS', {
          infer: true,
        }),
        downloadTtlSeconds: config.get('DOWNLOAD_URL_TTL_SECONDS', {
          infer: true,
        }),
      }),
    },
    {
      provide: ObjectStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
        const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', {
          infer: true,
        });
        return new S3ObjectStorage({
          endpoint: config.get('S3_ENDPOINT', { infer: true }),
          publicEndpoint: config.get('S3_PUBLIC_ENDPOINT', { infer: true }),
          region: config.get('S3_REGION', { infer: true }),
          bucket: config.get('S3_BUCKET', { infer: true }),
          credentials:
            accessKeyId && secretAccessKey
              ? { accessKeyId, secretAccessKey }
              : undefined,
          forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
        });
      },
    },
  ],
  exports: [FilesService],
})
export class FilesModule implements OnApplicationBootstrap {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly config: ConfigService<Env, true>,
    @Optional() health?: HealthRegistry,
  ) {
    // The object store, on /health (Krepis's HealthModule): files can't be
    // uploaded or downloaded without it.
    health?.register({
      name: 'storage',
      check: (signal) => this.storage.ping(signal),
    });
  }

  /** Locally, the bucket is made if it's missing (`S3_CREATE_BUCKET`). */
  async onApplicationBootstrap(): Promise<void> {
    if (
      this.config.get('S3_CREATE_BUCKET', { infer: true }) &&
      this.storage instanceof S3ObjectStorage
    ) {
      await this.storage.ensureBucket();
    }
  }
}
