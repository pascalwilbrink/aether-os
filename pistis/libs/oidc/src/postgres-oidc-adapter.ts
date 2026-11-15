import type { Adapter, AdapterPayload } from 'oidc-provider';
import { IsNull, LessThan, MoreThan, type Repository } from 'typeorm';

import { OidcPayloadEntity } from './oidc-payload.entity.js';

/**
 * An oidc-provider storage adapter over Postgres (`oidc_payloads`), so
 * sessions and grants survive restarts and are shared by every Pistis
 * instance. oidc-provider constructs one per model, with the model's name.
 */
type Upsert = Parameters<Repository<OidcPayloadEntity>['upsert']>[0];
type Lookup = { id: string } | { uid: string } | { userCode: string };

export function postgresOidcAdapter(
  payloads: Repository<OidcPayloadEntity>,
): new (kind: string) => Adapter {
  return class PostgresOidcAdapter implements Adapter {
    readonly kind: string;

    constructor(kind: string) {
      this.kind = kind;
    }

    async upsert(
      id: string,
      payload: AdapterPayload,
      expiresIn: number,
    ): Promise<void> {
      await payloads.upsert(
        {
          kind: this.kind,
          id,
          payload,
          grantId: payload.grantId ?? null,
          uid: payload.uid ?? null,
          userCode: payload.userCode ?? null,
          expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
          consumedAt: null,
        } as Upsert,
        ['kind', 'id'],
      );
    }

    find(id: string): Promise<AdapterPayload | undefined> {
      return this.findOne({ id });
    }

    findByUid(uid: string): Promise<AdapterPayload | undefined> {
      return this.findOne({ uid });
    }

    findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
      return this.findOne({ userCode });
    }

    async consume(id: string): Promise<void> {
      await payloads.update(
        { kind: this.kind, id },
        { consumedAt: new Date() },
      );
    }

    async destroy(id: string): Promise<void> {
      await payloads.delete({ kind: this.kind, id });
    }

    async revokeByGrantId(grantId: string): Promise<void> {
      await payloads.delete({ kind: this.kind, grantId });
    }

    async findOne(where: Lookup): Promise<AdapterPayload | undefined> {
      const row = await payloads.findOne({
        where: [
          { ...where, kind: this.kind, expiresAt: IsNull() },
          { ...where, kind: this.kind, expiresAt: MoreThan(new Date()) },
        ],
      });
      if (!row) {
        return undefined;
      }

      return {
        ...(row.payload as AdapterPayload),
        ...(row.consumedAt
          ? { consumed: Math.floor(row.consumedAt.getTime() / 1000) }
          : {}),
      };
    }
  };
}

/** Deletes expired state. */
export async function pruneOidcPayloads(
  payloads: Repository<OidcPayloadEntity>,
): Promise<void> {
  await payloads.delete({ expiresAt: LessThan(new Date()) });
}
