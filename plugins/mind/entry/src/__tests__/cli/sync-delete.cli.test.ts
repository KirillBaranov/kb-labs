import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';

vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

import { promises as fsp } from 'node:fs';
import syncDeleteCommand from '../../cli/commands/sync-delete.js';

const existingEntries = [{ id: 'src-1', path: './docs', addedAt: '2026-01-01T00:00:00Z' }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fsp.readFile).mockResolvedValue(JSON.stringify(existingEntries) as never);
  vi.mocked(fsp.writeFile).mockResolvedValue(undefined);
  vi.mocked(fsp.mkdir).mockResolvedValue(undefined);
});

describe('mind:sync:delete', () => {
  it('SD-01: deletes entry with --force — exitCode 0, success message', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncDeleteCommand.execute(
      ctx as never,
      mockCLIInput({ argv: ['src-1'], flags: { force: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledOnce();
  });

  it('SD-02: --json outputs { ok, deleted, id }', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncDeleteCommand.execute(
      ctx as never,
      mockCLIInput({ argv: ['src-1'], flags: { force: true, json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ ok: true, deleted: true, id: 'src-1' });
  });

  it('SD-03: missing id argv — exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncDeleteCommand.execute(
      ctx as never,
      mockCLIInput({ argv: [], flags: { force: true } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('SD-04: missing --force — exitCode 1, warn shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncDeleteCommand.execute(
      ctx as never,
      mockCLIInput({ argv: ['src-1'], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.warnings.length).toBeGreaterThan(0);
  });

  it('SD-05: unknown id — exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncDeleteCommand.execute(
      ctx as never,
      mockCLIInput({ argv: ['unknown-id'], flags: { force: true } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('SD-06: --dry-run shows intent, writeFile is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncDeleteCommand.execute(
      ctx as never,
      mockCLIInput({ argv: ['src-1'], flags: { 'dry-run': true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(fsp.writeFile)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('src-1');
  });
});
