import { findNearestConfig, readJsonWithDiagnostics } from '@kb-labs/core-config';
import { GatewayConfigSchema, type GatewayConfig } from '@kb-labs/gateway-contracts';

const CONFIG_FILENAMES = [
  '.kb/kb.config.jsonc',
  '.kb/kb.config.json',
  'kb.config.jsonc',
  'kb.config.json',
] as const;

async function tryLoadGatewayFromDir(dir: string): Promise<GatewayConfig | null> {
  // Try all config filenames in order — .jsonc is human-edited (no gateway section),
  // .json is machine-written by kb-create (contains gateway upstreams). We must not
  // stop at the first file found; we must find the first file that has a "gateway" key.
  for (const filename of CONFIG_FILENAMES) {
    const { path: configPath } = await findNearestConfig({
      startDir: dir,
      stopDir: dir,
      filenames: [filename],
    });

    if (!configPath) { continue; }

    const result = await readJsonWithDiagnostics<{ gateway?: unknown }>(configPath);
    if (!result.ok || !result.data.gateway) { continue; }

    return GatewayConfigSchema.parse(result.data.gateway);
  }

  return null;
}

export async function loadGatewayConfig(repoRoot: string, platformRoot?: string): Promise<GatewayConfig> {
  // Project config overrides platform defaults
  const fromProject = await tryLoadGatewayFromDir(repoRoot);
  if (fromProject) { return fromProject; }

  // Fall back to platform installation config (installed mode)
  if (platformRoot && platformRoot !== repoRoot) {
    const fromPlatform = await tryLoadGatewayFromDir(platformRoot);
    if (fromPlatform) { return fromPlatform; }
  }

  return GatewayConfigSchema.parse({});
}
