import { readMergedRawConfig } from '@kb-labs/core-config';
import { GatewayConfigSchema, type GatewayConfig } from '@kb-labs/gateway-contracts';

/**
 * Gateway config resolution.
 *
 * Delegates the entire layering (platform baseline ← project layer ←
 * `.kb/overlays/*.jsonc` from `kb-dev ensure --scenario`) to
 * `@kb-labs/core-config :: readMergedRawConfig`. This file does one job:
 * pluck the `gateway` section out of the merged result and validate it
 * against the schema. Any change in how layers compose belongs in
 * core-config, not here.
 */
export async function loadGatewayConfig(repoRoot: string, platformRoot?: string): Promise<GatewayConfig> {
  const merged = await readMergedRawConfig(repoRoot, { platformRoot });
  const gateway = (merged?.data as { gateway?: unknown } | undefined)?.gateway;
  if (gateway && typeof gateway === 'object' && !Array.isArray(gateway)) {
    return GatewayConfigSchema.parse(gateway);
  }
  return GatewayConfigSchema.parse({});
}
