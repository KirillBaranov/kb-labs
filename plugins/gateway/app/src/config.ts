import {
  readJsonWithDiagnostics,
  readMergedRawConfig,
  mergeOverlay,
} from '@kb-labs/core-config';
import { GatewayConfigSchema, type GatewayConfig } from '@kb-labs/gateway-contracts';

/**
 * Gateway config resolution.
 *
 * Layered, overlay-aware load:
 *
 *  1. `platformRoot/.kb/kb.config.*`  — baseline. In installed mode `kb-create`
 *     writes the gateway section here (port, upstreams, staticTokens).
 *  2. `projectRoot/.kb/kb.config.*`   — project layer. Optional gateway tweaks.
 *  3. `projectRoot/.kb/overlays/*.jsonc`  — scenario overlays applied by
 *     `kb-dev ensure --scenario` (deep-merged on top of the project layer
 *     by `readMergedRawConfig`).
 *
 * The three layers are deep-merged with project (+ overlays) winning per
 * field. This lets `gateway-pressure/overlay.jsonc` (which only carries the
 * `gateway.pressure` delta) take effect over the full platform baseline
 * without forcing the overlay to redeclare the entire gateway block.
 */

async function readGatewaySectionRaw(rootRel: string): Promise<Record<string, unknown> | null> {
  const candidates = [
    `${rootRel}/.kb/kb.config.jsonc`,
    `${rootRel}/.kb/kb.config.json`,
    `${rootRel}/kb.config.jsonc`,
    `${rootRel}/kb.config.json`,
  ];
  for (const path of candidates) {
    const result = await readJsonWithDiagnostics<Record<string, unknown>>(path);
    if (!result.ok) { continue; }
    const gw = result.data.gateway;
    if (gw && typeof gw === 'object' && !Array.isArray(gw)) {
      return gw as Record<string, unknown>;
    }
  }
  return null;
}

async function readProjectGatewayRaw(projectRoot: string): Promise<Record<string, unknown> | null> {
  // Overlay-aware read for the project layer: `readMergedRawConfig` deep-
  // merges `.kb/overlays/*.jsonc` onto the project config so scenario
  // overlays flow through to gateway-app on its next boot.
  const merged = await readMergedRawConfig(projectRoot);
  if (!merged) { return null; }
  const gw = (merged.data as { gateway?: unknown }).gateway;
  if (gw && typeof gw === 'object' && !Array.isArray(gw)) {
    return gw as Record<string, unknown>;
  }
  return null;
}

export async function loadGatewayConfig(repoRoot: string, platformRoot?: string): Promise<GatewayConfig> {
  const platformRaw = platformRoot && platformRoot !== repoRoot
    ? await readGatewaySectionRaw(platformRoot)
    : null;
  const projectRaw = await readProjectGatewayRaw(repoRoot);

  if (!platformRaw && !projectRaw) {
    return GatewayConfigSchema.parse({});
  }

  // Deep-merge baseline ← project+overlays. `mergeOverlay` deep-merges
  // objects and lets overlay scalars override the base; the optional
  // `kb:merge` directive is unused at this layer but harmless.
  const merged = mergeOverlay(platformRaw ?? {}, projectRaw ?? {});
  return GatewayConfigSchema.parse(merged);
}
