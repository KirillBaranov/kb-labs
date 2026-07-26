import { describe, it, expect } from 'vitest';
import { mockCLIInput } from '@kb-labs/sdk/testing';
import type { PluginContextV3 } from '@kb-labs/sdk';
import syncDeleteCmd from '../../cli/commands/sync-delete.js';

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

describe('mind sync delete — destructive confirmation gate', () => {
  it('errors when no paths are given (before any confirmation)', async () => {
    const { ctx, calls } = captureCtx();
    const res = await syncDeleteCmd.execute(ctx, mockCLIInput({ argv: [], flags: { index: 'code', yes: false } }));
    expect(res.ok).toBe(false);
    expect(calls.error).toHaveLength(1);
  });

  it('blocks deletion without --yes and surfaces the irreversible warning', async () => {
    const { ctx, calls } = captureCtx();
    const res = await syncDeleteCmd.execute(
      ctx,
      mockCLIInput({ argv: ['src/a.ts', 'src/b.ts'], flags: { index: 'code', yes: false, json: false } }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected command failure');
    expect(res.error).toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    expect(calls.warn).toHaveLength(1);
    expect(calls.warn[0]).toContain('--yes');
  });

  it('emits the confirmationRequired signal in --json mode', async () => {
    const { ctx, calls } = captureCtx();
    await syncDeleteCmd.execute(
      ctx,
      mockCLIInput({ argv: ['src/a.ts'], flags: { index: 'code', yes: false, json: true } }),
    );
    expect(calls.json).toHaveLength(1);
    expect(calls.json[0]).toMatchObject({
      confirmationRequired: true,
      destructive: true,
      action: 'mind sync delete',
      severity: 'medium',
    });
  });
});
