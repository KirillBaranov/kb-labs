import { findNearestConfig, readJsonWithDiagnostics } from '@kb-labs/core-config';
import { GatewayConfigSchema, type GatewayConfig } from '@kb-labs/gateway-contracts';

export async function loadGatewayConfig(repoRoot: string): Promise<GatewayConfig> {
  const { path: configPath } = await findNearestConfig({
    startDir: repoRoot,
    filenames: ['.kb/kb.config.json', 'kb.config.json'],
  });

  if (!configPath) {
    return GatewayConfigSchema.parse({});
  }

  const result = await readJsonWithDiagnostics<{ gateway?: unknown }>(configPath);
  if (!result.ok || !result.data.gateway) {
    return GatewayConfigSchema.parse({});
  }

  return GatewayConfigSchema.parse(result.data.gateway);
}
