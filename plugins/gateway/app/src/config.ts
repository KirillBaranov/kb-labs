import { findNearestConfig, readJsonWithDiagnostics } from '@kb-labs/core-config';
import { GatewayConfigSchema, type GatewayConfig } from '@kb-labs/gateway-contracts';

async function tryLoadGatewayFromDir(dir: string): Promise<GatewayConfig | null> {
  const { path: configPath } = await findNearestConfig({
    startDir: dir,
    stopDir: dir,
    filenames: ['.kb/kb.config.jsonc', '.kb/kb.config.json', 'kb.config.jsonc', 'kb.config.json'],
  });

  if (!configPath) return null;

  const result = await readJsonWithDiagnostics<{ gateway?: unknown }>(configPath);
  if (!result.ok || !result.data.gateway) return null;

  return GatewayConfigSchema.parse(result.data.gateway);
}

export async function loadGatewayConfig(repoRoot: string, platformRoot?: string): Promise<GatewayConfig> {
  // Project config overrides platform defaults
  const fromProject = await tryLoadGatewayFromDir(repoRoot);
  if (fromProject) return fromProject;

  // Fall back to platform installation config (installed mode)
  if (platformRoot && platformRoot !== repoRoot) {
    const fromPlatform = await tryLoadGatewayFromDir(platformRoot);
    if (fromPlatform) return fromPlatform;
  }

  return GatewayConfigSchema.parse({});
}
