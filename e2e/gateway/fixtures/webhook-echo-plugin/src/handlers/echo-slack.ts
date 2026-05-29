/**
 * echo-slack handler — echoes payload. Has challenge support for Slack url_verification.
 * Challenge is answered by the gateway before this handler is called.
 */

import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

export default async function echoSlackHandler(
  ctx: PluginContextV3,
  input: unknown,
): Promise<{ ok: boolean; data: { echo: unknown } }> {
  return { ok: true, data: { echo: input } };
}
