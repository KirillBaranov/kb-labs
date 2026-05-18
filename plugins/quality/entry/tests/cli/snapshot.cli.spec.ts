import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@kb-labs/quality-core', () => ({
  analyzeLayering: vi.fn().mockResolvedValue({ totalViolations: 0, violations: [] }),
  analyzeCoupling: vi.fn().mockReturnValue({ packages: [], avgInstability: 0 }),
  runKnip: vi.fn().mockResolvedValue({ unusedFiles: [], unusedExports: [], unusedDependencies: [], unlistedDependencies: [], totalIssues: 0 }),
  analyzeTypes: vi.fn().mockResolvedValue({ packages: [] }),
  QualitySnapshotStore: vi.fn().mockImplementation(() => ({
    save: vi.fn().mockReturnValue({ score: 90, grade: 'A', dimensions: {}, git: {} }),
  })),
  calculateHealth: vi.fn().mockReturnValue({
    score: 90,
    grade: 'A',
    dimensions: {},
  }),
}));

vi.mock('@kb-labs/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kb-labs/sdk')>();
  return {
    ...actual,
    useConfig: vi.fn().mockResolvedValue(null),
  };
});

import { analyzeLayering, analyzeCoupling, runKnip, analyzeTypes, QualitySnapshotStore, calculateHealth } from '@kb-labs/quality-core';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import snapshotCommand from '../../src/cli/commands/snapshot.js';

interface SnapshotFlags {
  json?: boolean;
  'dry-run'?: boolean;
}

const mockSnap = { score: 90, grade: 'A', dimensions: {}, git: {} };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(analyzeLayering).mockResolvedValue({ totalViolations: 0, violations: [] } as never);
  vi.mocked(analyzeCoupling).mockReturnValue({ packages: [], avgInstability: 0 } as never);
  vi.mocked(runKnip).mockResolvedValue({ unusedFiles: [], unusedExports: [], unusedDependencies: [], unlistedDependencies: [], totalIssues: 0 });
  vi.mocked(analyzeTypes).mockResolvedValue({ packages: [] } as never);
  vi.mocked(calculateHealth).mockReturnValue({ score: 90, grade: 'A', dimensions: {} } as never);
  vi.mocked(QualitySnapshotStore).mockImplementation(() => ({
    save: vi.fn().mockReturnValue(mockSnap),
  }) as never);
});

describe('quality:snapshot', () => {
  it('QSNAP-01: collects metrics and saves snapshot', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await snapshotCommand.execute(ctx as never, mockCLIInput<SnapshotFlags>());

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('QSNAP-02: --json outputs snapshot data', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await snapshotCommand.execute(ctx as never, mockCLIInput<SnapshotFlags>({ flags: { json: true } }));

    expect(result.exitCode).toBe(0);
    expect(captured.json.length).toBeGreaterThan(0);
    expect((captured.json[0] as Record<string, unknown>).score).toBe(90);
  });

  it('QSNAP-03: --dry-run shows intent, no metrics collected', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await snapshotCommand.execute(ctx as never, mockCLIInput<SnapshotFlags>({ flags: { 'dry-run': true } }));

    expect(result.exitCode).toBe(0);
    expect(QualitySnapshotStore).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
  });
});
