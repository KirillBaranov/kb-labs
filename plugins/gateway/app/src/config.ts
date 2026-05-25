import { readJsonWithDiagnostics, readMergedRawConfig } from '@kb-labs/core-config';
import { GatewayConfigSchema, type GatewayConfig } from '@kb-labs/gateway-contracts';

/**
 * Explicit absolute path to a gateway config file. When set, takes precedence
 * over the project/platform discovery chain.
 *
 * @deprecated Use `kb-dev ensure --scenario` to manage gateway-specific
 *   config via `.kb/overlays/*.jsonc` instead. This env var is kept as an
 *   escape hatch for legacy entrypoints and will be removed once all callers
 *   migrate.
 */
const EXPLICIT_CONFIG_ENV = 'KB_GATEWAY_CONFIG_PATH';

function extractGatewaySection(data: Record<string, unknown> | undefined): GatewayConfig | null {
  if (!data || typeof data.gateway !== 'object' || data.gateway === null) {
    return null;
  }
  return GatewayConfigSchema.parse(data.gateway);
}

async function tryLoadGatewayFromProject(projectRoot: string): Promise<GatewayConfig | null> {
  // Use the overlay-aware reader: returns the project's .kb/kb.config.*
  // deep-merged with any .kb/overlays/*.jsonc applied by `kb-dev ensure
  // --scenario`. This is how gateway picks up scenario-driven config
  // changes (e.g. pressure-control limits) after a restart.
  const merged = await readMergedRawConfig(projectRoot);
  if (!merged) {
    return null;
  }
  return extractGatewaySection(merged.data);
}

async function tryLoadGatewayFromPlatform(platformRoot: string): Promise<GatewayConfig | null> {
  // Platform-root lookup is intentionally NOT overlay-aware: overlays are a
  // project-local concept, not a platform default. We read whichever
  // kb.config.* file exists in the platform root, if any.
  const candidates = [
    `${platformRoot}/.kb/kb.config.jsonc`,
    `${platformRoot}/.kb/kb.config.json`,
    `${platformRoot}/kb.config.jsonc`,
    `${platformRoot}/kb.config.json`,
  ];
  for (const path of candidates) {
    const result = await readJsonWithDiagnostics<Record<string, unknown>>(path);
    if (!result.ok) { continue; }
    const section = extractGatewaySection(result.data);
    if (section) { return section; }
  }
  return null;
}

export async function loadGatewayConfig(repoRoot: string, platformRoot?: string): Promise<GatewayConfig> {
  // Explicit path wins — kept as an escape hatch for legacy entrypoints.
  // Prefer `kb-dev ensure --scenario` for new code.
  const explicit = process.env[EXPLICIT_CONFIG_ENV];
  if (explicit && explicit.length > 0) {
    const result = await readJsonWithDiagnostics<{ gateway?: unknown }>(explicit);
    if (result.ok && result.data.gateway) {
      return GatewayConfigSchema.parse(result.data.gateway);
    }
  }

  // Project config + overlays.
  const fromProject = await tryLoadGatewayFromProject(repoRoot);
  if (fromProject) { return fromProject; }

  // Platform defaults (installed mode).
  if (platformRoot && platformRoot !== repoRoot) {
    const fromPlatform = await tryLoadGatewayFromPlatform(platformRoot);
    if (fromPlatform) { return fromPlatform; }
  }

  return GatewayConfigSchema.parse({});
}
