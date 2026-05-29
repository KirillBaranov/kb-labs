/**
 * echo-async handler — echoes payload. Async mode: gateway sends 202 immediately.
 */

import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

export default async function echoAsyncHandler(
  ctx: PluginContextV3,
  input: unknown,
): Promise<{ ok: boolean; data: { echo: unknown } }> {
  return { ok: true, data: { echo: input } };
}
