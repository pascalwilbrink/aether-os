import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@hephaestus/core';

export type ToolServerAuthType = ApiTypes.ToolServerAuthType;

/**
 * An organization's MCP server (Streamable HTTP) that agent versions take
 * tools from, by `name`. A `header` credential is in OpenBao
 * (`toolServerCredentialPath`), never here: only its last characters, who
 * set it and when.
 */
@Entity({ name: 'tool_servers' })
@Check(
  'ck_tool_servers_auth_type',
  `auth_type IN ('none', 'header', 'task-token')`,
)
@Index('uq_tool_servers_organization_id_name', ['organizationId', 'name'], {
  unique: true,
})
export class ToolServerEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text' })
  authType: ToolServerAuthType;

  /** For `header`. */
  @Column({ type: 'text', nullable: true })
  headerName: string | null;

  /** The credential's last four characters; null while none is set. */
  @Column({ type: 'text', nullable: true })
  credentialHint: string | null;

  @Column({ type: 'text', nullable: true })
  credentialUpdatedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  credentialUpdatedAt: Date | null;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
