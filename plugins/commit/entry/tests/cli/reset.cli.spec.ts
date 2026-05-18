import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@kb-labs/commit-core', () => ({
  clearPlan: vi.fn(),
  hasPlan: vi.fn(),
}));

vi.mock('@kb-labs/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kb-labs/sdk')>();
  return {
    ...actual,
    findRepoRoot: vi.fn().mockResolvedValue('/project'),
  };
});

import { clearPlan, hasPlan } from '@kb-labs/commit-core';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import resetCommand from '../../src/cli/commands/reset.js';

interface ResetFlags {
  scope?: string;
  'dry-run'?: boolean;
}

interface ResetInput {
  scope?: string;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(hasPlan).mockResolvedValue(true);
  vi.mocked(clearPlan).mockResolvedValue(undefined);
});

describe('commit:reset', () => {
  it('RESET-01: clears existing plan and prints success', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await resetCommand.execute(ctx as never, {} as ResetInput);

    expect(result.exitCode).toBe(0);
    expect(clearPlan).toHaveBeenCalledOnce();
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('RESET-02: no plan exits 0 with info message', async () => {
    vi.mocked(hasPlan).mockResolvedValue(false);
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await resetCommand.execute(ctx as never, {} as ResetInput);

    expect(result.exitCode).toBe(0);
    expect(clearPlan).not.toHaveBeenCalled();
    expect(captured.infos.length).toBeGreaterThan(0);
  });

  it('RESET-03: --dry-run shows intent without clearing', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await resetCommand.execute(ctx as never, mockCLIInput<ResetFlags>({ flags: { 'dry-run': true } }));

    expect(result.exitCode).toBe(0);
    expect(clearPlan).not.toHaveBeenCalled();
    expect(captured.infos.length).toBeGreaterThan(0);
    expect(captured.infos[0]?.message).toContain('Dry-run');
  });

  it('RESET-04: scope is passed to clearPlan', async () => {
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    await resetCommand.execute(ctx as never, { scope: 'backend' } as ResetInput);

    expect(clearPlan).toHaveBeenCalledWith(expect.any(String), 'backend');
  });
});
