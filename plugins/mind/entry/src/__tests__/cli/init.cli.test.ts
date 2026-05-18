import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@kb-labs/mind-indexer', () => ({
  initMindStructure: vi.fn().mockResolvedValue('/project/.kb/mind'),
}));

import { initMindStructure } from '@kb-labs/mind-indexer';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import initCommand from '../../cli/commands/init.js';

interface InitFlags {
  cwd?: string;
  force?: boolean;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  'dry-run'?: boolean;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(initMindStructure).mockResolvedValue('/project/.kb/mind');
});

describe('mind:init', () => {
  it('INIT-01: initializes workspace and prints success', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await initCommand.execute(ctx as never, mockCLIInput<InitFlags>());

    expect(result.exitCode).toBe(0);
    expect(initMindStructure).toHaveBeenCalledOnce();
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('INIT-02: --json outputs structured result', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await initCommand.execute(ctx as never, mockCLIInput<InitFlags>({ flags: { json: true } }));

    expect(result.exitCode).toBe(0);
    expect((captured.json[0] as Record<string, unknown>)?.ok).toBe(true);
  });

  it('INIT-03: --dry-run shows intent, initMindStructure is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await initCommand.execute(ctx as never, mockCLIInput<InitFlags>({ flags: { 'dry-run': true } }));

    expect(result.exitCode).toBe(0);
    expect(initMindStructure).not.toHaveBeenCalled();
    expect(captured.infos.length).toBeGreaterThan(0);
    expect(captured.infos[0]?.message).toContain('Dry-run');
  });

  it('INIT-04: --quiet suppresses output', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await initCommand.execute(ctx as never, mockCLIInput<InitFlags>({ flags: { quiet: true } }));

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBe(0);
  });
});
