/**
 * @module @kb-labs/marketplace-core/strategies/adapter-strategy
 * Strategy for adapters — detects AdapterManifest, validates dependencies.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EntityKind } from '@kb-labs/core-discovery';
import type {
  EntityKindStrategy,
  MarketplaceServiceAPI,
  ScopeContext,
} from '@kb-labs/marketplace-contracts';

export class AdapterStrategy implements EntityKindStrategy {
  kind: EntityKind = 'adapter';

  async detectKind(packageRoot: string): Promise<EntityKind | null> {
    const manifest = await loadAdapterManifest(packageRoot);
    return manifest ? 'adapter' : null;
  }

  async extractProvides(_packageRoot: string): Promise<EntityKind[]> {
    return ['adapter'];
  }

  async afterInstall(
    packageId: string,
    packageRoot: string,
    service: MarketplaceServiceAPI,
    ctx: ScopeContext,
  ): Promise<void> {
    const manifest = await loadAdapterManifest(packageRoot);
    if (!manifest?.requires?.adapters) {return;}

    // Adapters only live in platform scope (guarded in MarketplaceService),
    // so we query the same scope we were invoked with.
    const installed = await service.list(ctx, { kind: 'adapter' });
    const installedIds = new Set(installed.map(e => e.id));

    for (const dep of manifest.requires.adapters) {
      const depId = typeof dep === 'string' ? dep : dep.id;
      const found = installedIds.has(depId) ||
        installed.some(e => e.id.includes(`adapters-${depId}`));

      if (!found) {
        console.warn(
          `[marketplace] Adapter "${packageId}" requires adapter "${depId}" which is not installed. ` +
          `Run: kb marketplace link <adapter-package-that-provides-${depId}>`,
        );
      }
    }
  }

  async beforeUninstall(
    packageId: string,
    service: MarketplaceServiceAPI,
    ctx: ScopeContext,
  ): Promise<void> {
    const installed = await service.list(ctx, { kind: 'adapter' });
    if (installed.length > 1) {
      console.warn(
        `[marketplace] Removing adapter "${packageId}" — verify no other adapters depend on it`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AdapterManifestLike {
  id?: string;
  type?: 'core' | 'extension' | 'proxy';
  implements?: string;
  requires?: {
    adapters?: Array<string | { id: string; alias?: string }>;
  };
}

async function loadAdapterManifest(packageRoot: string): Promise<AdapterManifestLike | null> {
  try {
    const distPath = path.join(packageRoot, 'dist', 'index.js');
    await fs.access(distPath);
    const mod = await import(pathToFileURL(distPath).href);
    if (mod.manifest && typeof mod.manifest === 'object' && mod.manifest.implements) {
      return mod.manifest as AdapterManifestLike;
    }
    return null;
  } catch {
    return null;
  }
}
