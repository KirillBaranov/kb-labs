/**
 * echo handler — echoes the request payload back as the response.
 * Auth: secret (X-Echo-Secret). Sync.
 */

import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

export default async function echoHandler(
  ctx: PluginContextV3,
  input: unknown,
): Promise<{ ok: boolean; data: { echo: unknown; webhookId: string } }> {
  const hostCtx = ctx.hostContext as { host: 'webhook'; webhookId: string; event: string };
  return {
    ok: true,
    data: { echo: input, webhookId: hostCtx.webhookId },
  };
}
