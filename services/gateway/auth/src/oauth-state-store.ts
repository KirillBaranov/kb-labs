/**
 * @module @kb-labs/gateway-auth/oauth-state-store
 *
 * Per-attempt OAuth `state` storage (ADR-0020, DD-5).
 *
 * Between `GET /auth/oauth/:id/start` and the IdP callback we must hold a
 * short-lived binding from the opaque `state` token to the flow context
 * (which provider issued it, which tenant, where to return, and the
 * per-attempt secrets like nonce / PKCE verifier). This is a thin,
 * namespaced wrapper over `IKVStore` — a real abstraction, not a stub:
 *
 * - **Namespaced keys** (`oauth:state:{state}`) so it can share the same
 *   KV as the rate limiter without collision.
 * - **TTL** so abandoned flows self-clean.
 * - **One-shot `consume`** (get → delete, gated on the delete result) so
 *   a replayed callback cannot be processed twice. With a shared Redis KV
 *   the gating on `delete()` is what provides the atomic single-winner
 *   guarantee under concurrency.
 *
 * NOTE: in a multi-process / HA deployment this MUST be backed by a
 * shared KV (Redis); an in-memory KV is per-process and a callback may
 * land on a different worker than the one that issued the state. The
 * bootstrap warns when a redirect provider is configured against an
 * in-memory KV (see OAuth hardening, Step 4b).
 */

import type { IKVStore } from '@kb-labs/core-platform/adapters';

/**
 * The flow context bound to a single `state` token. `session` carries the
 * provider's per-attempt secrets (OIDC nonce, PKCE verifier) verbatim and
 * is never logged.
 */
export interface OAuthStateRecord {
  /** The provider instance id that started this flow (mix-up guard). */
  providerId: string;
  /** The tenant the flow was started for (cross-tenant guard). */
  tenantId: string;
  /** Validated relative path to return to after success. */
  returnTo: string;
  /** Opaque per-attempt secrets the provider needs back at callback. */
  session?: Record<string, unknown>;
  /** Issue timestamp (ms). */
  createdAt: number;
}

export interface OAuthStateStoreOptions {
  /** State TTL in milliseconds. Default 10 minutes. */
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const KEY_PREFIX = 'oauth:state:';

export class OAuthStateStore {
  private readonly ttlMs: number;

  constructor(
    private readonly kv: IKVStore,
    opts: OAuthStateStoreOptions = {},
  ) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  private key(state: string): string {
    return `${KEY_PREFIX}${state}`;
  }

  /** Persist a state record with the configured TTL. */
  async put(state: string, record: OAuthStateRecord): Promise<void> {
    await this.kv.set(this.key(state), record, { ttlMs: this.ttlMs });
  }

  /**
   * One-shot read. Returns the record to the first caller and deletes it;
   * concurrent / subsequent callers get `null`. The `delete` result gates
   * the return so exactly one caller wins even under a shared KV.
   */
  async consume(state: string): Promise<OAuthStateRecord | null> {
    const key = this.key(state);
    const record = await this.kv.get<OAuthStateRecord>(key);
    if (!record) {
      return null;
    }
    const removed = await this.kv.delete(key);
    if (!removed) {
      // Lost the race — another caller already consumed this state.
      return null;
    }
    return record;
  }
}
