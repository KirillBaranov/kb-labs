import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';

// Mock scaffold-core before importing the command
vi.mock('@kb-labs/scaffold-core', () => ({
  scanRoot: vi.fn(),
}));

import { scanRoot } from '@kb-labs/scaffold-core';
import doctorCommand from '../../commands/doctor.js';

const mockedScanRoot = vi.mocked(scanRoot);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('scaffold:doctor', () => {
  it('SD-01: successful scan with no findings — exitCode 0, prints package count', async () => {
    mockedScanRoot.mockResolvedValue({
      findings: [],
      packagesScanned: 3,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await doctorCommand.execute(ctx, {});

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('3');
  });

  it('SD-02: --json outputs structured JSON with findings and packagesScanned', async () => {
    const findings = [
      { severity: 'warn' as const, message: 'missing field', package: 'my-pkg' },
    ];
    mockedScanRoot.mockResolvedValue({
      findings,
      packagesScanned: 2,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await doctorCommand.execute(ctx, { json: true });

    expect(result.ok).toBe(true);
    expect(captured.json.length).toBeGreaterThan(0);
    const payload = captured.json[0] as { packagesScanned: number; findings: unknown[] };
    expect(payload.packagesScanned).toBe(2);
    expect(payload.findings).toEqual(findings);
  });

  it('SD-03: findings with severity=error — exitCode 1, error message shown', async () => {
    mockedScanRoot.mockResolvedValue({
      findings: [
        { severity: 'error' as const, message: 'missing manifest', package: 'bad-pkg' },
      ],
      packagesScanned: 1,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await doctorCommand.execute(ctx, {});

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('SD-04: --path is forwarded to scanRoot', async () => {
    mockedScanRoot.mockResolvedValue({
      findings: [],
      packagesScanned: 0,
    });

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await doctorCommand.execute(ctx, { path: '/custom/path' });

    expect(mockedScanRoot).toHaveBeenCalledWith(
      expect.stringContaining('/custom/path'),
      expect.any(Object),
    );
  });

  it('SD-05: scanRoot throws — exitCode 1, error captured', async () => {
    mockedScanRoot.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await doctorCommand.execute(ctx, {});

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
