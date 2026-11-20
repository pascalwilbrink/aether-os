import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { attachment } from './content-disposition.js';
import {
  ObjectStorage,
  StorageUnavailableError,
  type ObjectDeclaration,
  type SignedRequest,
  type StoredObject,
} from './object-storage.js';

export interface S3StorageOptions {
  /** The S3 API Loculus calls; the region's AWS endpoint when left out. */
  endpoint?: string;
  /** The S3 API clients reach with signed URLs; `endpoint` by default. */
  publicEndpoint?: string;
  region: string;
  bucket: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
  forcePathStyle: boolean;
}

/**
 * `ObjectStorage` on S3 or an S3-compatible store (AWS SDK v3). Signed URLs
 * are made with a client for the public endpoint, since a signature covers
 * the host. An upload is signed with its content type, length and SHA-256,
 * so the store refuses any other bytes.
 */
export class S3ObjectStorage extends ObjectStorage {
  private readonly client: S3Client;
  private readonly signer: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    super();
    const config = (endpoint?: string): S3ClientConfig => ({
      region: options.region,
      endpoint,
      forcePathStyle: options.forcePathStyle,
      credentials: options.credentials,
      // Checksums only where asked for: the upload's own, never one the SDK
      // adds by itself (S3-compatible stores don't all take those).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.client = new S3Client(config(options.endpoint));
    this.signer = new S3Client(
      config(options.publicEndpoint ?? options.endpoint),
    );
  }

  async signUpload(
    key: string,
    declaration: ObjectDeclaration,
    ttlSeconds: number,
  ): Promise<SignedRequest> {
    const checksum = Buffer.from(declaration.sha256, 'hex').toString('base64');
    const url = await getSignedUrl(
      this.signer,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: declaration.contentType,
        ContentLength: declaration.sizeBytes,
        ChecksumSHA256: checksum,
      }),
      {
        expiresIn: ttlSeconds,
        signableHeaders: new Set(['content-type', 'content-length']),
        // A header the client sends, not a query parameter: the store
        // checks the bytes against it.
        unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
      },
    );
    return {
      url,
      headers: {
        'content-type': declaration.contentType,
        'x-amz-checksum-sha256': checksum,
      },
      expiresAt: expiry(ttlSeconds),
    };
  }

  async signDownload(
    key: string,
    fileName: string,
    ttlSeconds: number,
  ): Promise<SignedRequest> {
    const url = await getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ResponseContentDisposition: attachment(fileName),
      }),
      { expiresIn: ttlSeconds },
    );
    return { url, headers: {}, expiresAt: expiry(ttlSeconds) };
  }

  async inspect(key: string): Promise<StoredObject | null> {
    const head = await this.call(() =>
      this.client.send(
        new HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          ChecksumMode: 'ENABLED',
        }),
      ),
    );
    if (!head) {
      return null;
    }
    const sizeBytes = head.ContentLength ?? 0;
    // A store that keeps the upload's SHA-256 says so; otherwise (or for a
    // multipart checksum, `…-N`) the bytes are read and hashed.
    const stored = head.ChecksumSHA256;
    if (stored && !stored.includes('-')) {
      return {
        sizeBytes,
        sha256: Buffer.from(stored, 'base64').toString('hex'),
      };
    }
    return { sizeBytes, sha256: await this.hash(key) };
  }

  async delete(key: string): Promise<void> {
    await this.call(() =>
      this.client.send(
        new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }),
      ),
    );
  }

  /** Creates the bucket if it's missing (local development). */
  async ensureBucket(): Promise<void> {
    const exists = await this.call(() =>
      this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket })),
    );
    if (!exists) {
      await this.call(() =>
        this.client.send(
          new CreateBucketCommand({ Bucket: this.options.bucket }),
        ),
      );
    }
  }

  private async hash(key: string): Promise<string> {
    const object = await this.call(() =>
      this.client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      ),
    );
    const hash = createHash('sha256');
    for await (const chunk of (object?.Body as Readable | undefined) ?? []) {
      hash.update(chunk as Buffer);
    }
    return hash.digest('hex');
  }

  /** The call's result; null for "not there"; anything else is unavailable. */
  private async call<T>(send: () => Promise<T>): Promise<T | null> {
    try {
      return await send();
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        (error.$metadata.httpStatusCode === 404 ||
          error.name === 'NotFound' ||
          error.name === 'NoSuchKey' ||
          error.name === 'NoSuchBucket')
      ) {
        return null;
      }
      throw new StorageUnavailableError(
        `The object store refused or didn't answer: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
}

function expiry(ttlSeconds: number): Date {
  return new Date(Date.now() + ttlSeconds * 1000);
}
