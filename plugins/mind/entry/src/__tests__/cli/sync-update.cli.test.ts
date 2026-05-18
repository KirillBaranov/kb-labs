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
import syncUpdateCommand from '../../cli/commands/sync-update.js';

const existingEntries = [{ id: 'src-1', path: './old-docs', addedAt: '2026-01-01T00:00:00Z' }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fsp.readFile).mockResolvedValue(JSON.stringify(existingEntries) as never);
  vi.mocked(fsp.writeFile).mockResolvedValue(undefined);
  vi.mocked(fsp.mkdir).mockResolvedValue(undefined);
});

describe('mind:sync:update', () => {
  it('SU-01: updates entry — exitCode 0, success message', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncUpdateCommand.execute(
      ctx as never,
      mockCLIInput({ argv: ['src-1'], flags: { path: './new-docs' } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledOnce();
  });

  it('SU-02: --json outputs { id, path }', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncUpdateCommand.execute(
      ctx as never,
      mockCLIInput({ argv: ['src-1'], flags: { path: './new-docs', json: true } }),
    );

    expect(result.exitCode).toBe(0);
    const out = captured.json[0] as Record<string, unknown>;
    expect(out.id).toBe('src-1');
    expect(out.path).toBe('./new-docs');
  });

  it('SU-03: missing id argv — exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncUpdateCommand.execute(
      ctx as never,
      mockCLIInput({ argv: [], flags: { path: './new-docs' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('SU-04: missing --path — exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncUpdateCommand.execute(
      ctx as never,
      mockCLIInput({ argv: ['src-1'], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('SU-05: unknown id — exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncUpdateCommand.execute(
      ctx as never,
      mockCLIInput({ argv: ['unknown-id'], flags: { path: './new-docs' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('SU-06: --dry-run shows intent, writeFile is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await syncUpdateCommand.execute(
      ctx as never,
      mockCLIInput({ argv: ['src-1'], flags: { path: './new-docs', 'dry-run': true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(fsp.writeFile)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('src-1');
  });
});
