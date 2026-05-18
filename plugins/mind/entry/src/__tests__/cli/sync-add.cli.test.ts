import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';

vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

import { promises as fsp } from 'node:fs';
import syncAddCommand from '../../cli/commands/sync-add.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fsp.readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  vi.mocked(fsp.writeFile).mockResolvedValue(undefined);
  vi.mocked(fsp.mkdir).mockResolvedValue(undefined);
});

describe('mind:sync:add', () => {
  it('SA-01: adds source path — exitCode 0, success message', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncAddCommand.execute(ctx as never, mockCLIInput({ flags: { path: './docs' } }));

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledOnce();
  });

  it('SA-02: --json outputs { id, path }', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncAddCommand.execute(ctx as never, mockCLIInput({ flags: { path: './docs', json: true } }));

    expect(result.exitCode).toBe(0);
    const out = captured.json[0] as Record<string, unknown>;
    expect(out.path).toBe('./docs');
    expect(typeof out.id).toBe('string');
  });

  it('SA-03: missing --path returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncAddCommand.execute(ctx as never, mockCLIInput({ flags: {} }));

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('SA-04: duplicate path returns exitCode 1', async () => {
    vi.mocked(fsp.readFile).mockResolvedValue(
      JSON.stringify([{ id: 'src-1', path: './docs', addedAt: '' }]) as never,
    );

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncAddCommand.execute(ctx as never, mockCLIInput({ flags: { path: './docs' } }));

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
    expect(vi.mocked(fsp.writeFile)).not.toHaveBeenCalled();
  });

  it('SA-05: --dry-run shows intent, writeFile is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncAddCommand.execute(ctx as never, mockCLIInput({ flags: { path: './docs', 'dry-run': true } }));

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(fsp.writeFile)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('./docs');
  });
});
