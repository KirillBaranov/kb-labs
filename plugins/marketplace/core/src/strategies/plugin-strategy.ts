/**
 * @module @kb-labs/marketplace-core/strategies/plugin-strategy
 * Strategy for plugins — detects ManifestV3 and extracts entity kinds.
 */

import type { EntityKind } from '@kb-labs/core-discovery';
import type { EntityKindStrategy } from '@kb-labs/marketplace-contracts';
import { loadManifest, DiagnosticCollector, extractEntityKinds } from '@kb-labs/core-discovery';

export class PluginStrategy implements EntityKindStrategy {
  kind: EntityKind = 'plugin';

  async detectKind(packageRoot: string): Promise<EntityKind | null> {
    const diag = new DiagnosticCollector();
    const manifest = await loadManifest(packageRoot, diag);
    return manifest ? 'plugin' : null;
  }

  async extractProvides(packageRoot: string): Promise<EntityKind[]> {
    const diag = new DiagnosticCollector();
    const manifest = await loadManifest(packageRoot, diag);
    if (!manifest) {return ['plugin'];}
    return extractEntityKinds(manifest);
  }
}
