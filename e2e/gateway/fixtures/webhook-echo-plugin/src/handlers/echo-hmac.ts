/**
 * echo-hmac handler — echoes payload back. Auth: HMAC-SHA256.
 */

import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

export default async function echoHmacHandler(
  ctx: PluginContextV3,
  input: unknown,
): Promise<{ ok: boolean; data: { echo: unknown } }> {
  return { ok: true, data: { echo: input } };
}
