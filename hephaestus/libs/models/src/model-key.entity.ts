import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@hephaestus/core';

export type ModelKeyScope = ApiTypes.ModelKeyResponse['scope'];

/**
 * That a provider key is set (docs/models.md, Keys), for the organization or
 * one of its agents: the key itself is in OpenBao (`modelKeyPath`), never
 * here. Only what tells keys apart: the last characters, who set it, when
 * (and an Ollama server's URL).
 */
@Entity({ name: 'model_keys' })
@Check('ck_model_keys_scope', `scope IN ('organization', 'agent')`)
@Index(
  'uq_model_keys_scope_scope_id_provider',
  ['scope', 'scopeId', 'provider'],
  {
    unique: true,
  },
)
export class ModelKeyEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  scope: ModelKeyScope;

  /** The organization, or the agent. */
  @Column({ type: 'uuid' })
  scopeId: string;

  @Column({ type: 'text' })
  provider: string;

  /** The key's last four characters; null for an Ollama server without one. */
  @Column({ type: 'text', nullable: true })
  hint: string | null;

  /** For Ollama: its server (not a secret, so it's here too). */
  @Column({ type: 'text', nullable: true })
  baseUrl: string | null;

  @Column({ type: 'text' })
  updatedBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
