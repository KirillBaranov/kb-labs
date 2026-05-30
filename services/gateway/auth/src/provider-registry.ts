/**
 * @module @kb-labs/gateway-auth/provider-registry
 *
 * Tiny registry for `IIdentityProvider` instances (ADR-0020, Phase 1.11).
 *
 * Two invariants enforced beyond what a raw Map would give us:
 * - Re-registering the same `id` throws — usually a bootstrap bug,
 *   never intentional.
 * - `list()` returns only the public `{ id, kind }` shape so the
 *   `GET /auth/providers` route cannot accidentally serialise an
 *   `authenticate` function over the wire.
 */

import type { IIdentityProvider } from '@kb-labs/core-contracts';

export interface ProviderInfo {
  id: string;
  kind: IIdentityProvider['kind'];
}

export class ProviderRegistry {
  private readonly providers = new Map<string, IIdentityProvider>();

  register(provider: IIdentityProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`provider-registry: id "${provider.id}" is already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: string): IIdentityProvider | undefined {
    return this.providers.get(id);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  list(): ProviderInfo[] {
    return [...this.providers.values()].map(p => ({ id: p.id, kind: p.kind }));
  }
}
