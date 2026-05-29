/**
 * echo-multi handler — echoes payload. Multi: true (per-instance secrets).
 */

import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

export default async function echoMultiHandler(
  ctx: PluginContextV3,
  input: unknown,
): Promise<{ ok: boolean; data: { echo: unknown; instanceId?: string } }> {
  const hostCtx = ctx.hostContext as { host: 'webhook'; instanceId?: string };
  return { ok: true, data: { echo: input, instanceId: hostCtx.instanceId } };
}
