import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@loculus/core';

export type FileStatus = ApiTypes.FileStatus;

/** Postgres `bigint` comes back as a string; sizes fit a JS number. */
const bigintAsNumber = {
  to: (value: number) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

/**
 * A project's file (docs/files.md): what was declared, where its bytes are
 * (`objectKey`, in the bucket), and whether its upload was completed.
 */
@Entity({ name: 'files' })
@Check('ck_files_status', `status IN ('pending', 'available')`)
@Check('ck_files_size_bytes', `size_bytes >= 0`)
@Index('ix_files_project_created', [
  'organizationId',
  'projectId',
  'createdAt',
  'id',
])
@Index('ix_files_project_status_created', [
  'organizationId',
  'projectId',
  'status',
  'createdAt',
  'id',
])
export class FileEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  /** `orgs/{organizationId}/projects/{projectId}/files/{id}`. */
  @Column({ type: 'text', unique: true })
  objectKey: string;

  @Column({ type: 'text' })
  fileName: string;

  @Column({ type: 'text' })
  contentType: string;

  @Column({ type: 'bigint', transformer: bigintAsNumber })
  sizeBytes: number;

  /** Lowercase hex. */
  @Column({ type: 'text' })
  sha256: string;

  @Column({ type: 'text' })
  status: FileStatus;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
