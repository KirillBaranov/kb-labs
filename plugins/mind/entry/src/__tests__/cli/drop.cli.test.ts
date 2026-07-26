import { describe, it, expect } from 'vitest';
import { mockCLIInput } from '@kb-labs/sdk/testing';
import type { PluginContextV3 } from '@kb-labs/sdk';
import dropCmd from '../../cli/commands/drop.js';

/**
 * `mind drop` is destructive — it must NOT run without --yes, in any mode. The
 * confirmation gate fires before the engine is ever built, so these assert the
 * software-protocol behaviour without a live platform.
 */
function captureCtx() {
  const calls = { json: [] as unknown[], warn: [] as string[], error: [] as string[] };
  const ctx = {
    host: 'cli',
    cwd: process.cwd(),
    ui: {
      json: (d: unknown) => calls.json.push(d),
      warn: (m: string) => calls.warn.push(m),
      error: (m: string) => calls.error.push(m),
      success: () => {},
      info: () => {},
    },
  } as unknown as PluginContextV3;
  return { ctx, calls };
}

describe('mind drop — destructive confirmation gate', () => {
  it('blocks with a typed failure and warns without --yes — no execution', async () => {
    const { ctx, calls } = captureCtx();
    const res = await dropCmd.execute(ctx, mockCLIInput({ flags: { index: 'code', yes: false, json: false } }));
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected command failure');
    expect(res.error).toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    expect(calls.warn).toHaveLength(1);
    expect(calls.warn[0]).toContain('--yes');
  });

  it('emits a machine-readable confirmationRequired signal in --json mode', async () => {
    const { ctx, calls } = captureCtx();
    const res = await dropCmd.execute(ctx, mockCLIInput({ flags: { index: 'code', yes: false, json: true } }));
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected command failure');
    expect(res.error).toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    expect(calls.json).toHaveLength(1);
    expect(calls.json[0]).toMatchObject({
      confirmationRequired: true,
      destructive: true,
      action: 'mind drop',
      severity: 'high',
      confirmWith: '--yes',
    });
  });
});
