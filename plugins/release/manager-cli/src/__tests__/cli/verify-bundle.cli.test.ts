import { join, resolve } from 'node:path';

import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import { describe, expect, it } from 'vitest';

import verifyBundleCommand from '../../cli/commands/verify-bundle.js';

const GOLDEN = join(resolve(__dirname, '../../../../../..'), 'fixtures', 'release', 'golden');

describe('release:verify-bundle', () => {
  it('VB-01: --json reports a structured pass over the golden bundle', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await verifyBundleCommand.execute(
      ctx as never,
      mockCLIInput({ flags: { bundle: GOLDEN, json: true } }),
    );

    expect(result.ok).toBe(true);
    const report = captured.json[0] as Record<string, unknown>;
    expect(report.ok).toBe(true);
    expect(report.diagnostics).toEqual([]);
    expect(report.releaseId).toBe('platform-2.119.0');
    expect(report.counts).toMatchObject({ tarballs: 3, binaries: 2 });
  });

  it('VB-02: a mismatched approved digest fails with the report still attached', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await verifyBundleCommand.execute(
      ctx as never,
      mockCLIInput({ flags: { bundle: GOLDEN, expectedSha256: 'e'.repeat(64), json: true } }),
    );

    expect(result.ok).toBe(false);
    const report = captured.json[0] as { diagnostics: Array<{ code: string }> };
    expect(report.diagnostics.map(diagnostic => diagnostic.code)).toContain('KB_BUNDLE_DIGEST_MISMATCH');
  });

  it('VB-03: a rule violation is printed one diagnostic per line in text mode', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await verifyBundleCommand.execute(
      ctx as never,
      mockCLIInput({ flags: { bundle: join(GOLDEN, 'npm') } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors[0]).toContain('KB_BUNDLE_MANIFEST_MISSING');
  });

  it('VB-04: missing --bundle fails before touching the filesystem', async () => {
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await verifyBundleCommand.execute(ctx as never, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
  });
});
