import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';

import lintCommand from '../../commands/lint.js';

const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/lint/${name}`, import.meta.url));

const fixturesDir = fileURLToPath(new URL('./fixtures/lint', import.meta.url));

describe('workflow:lint', () => {
  it('CLI-01: valid file → exitCode 0, no errors reported', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });

    const result = await lintCommand.execute(ctx, mockCLIInput({ flags: { path: fixture('valid.yml') } }));

    expect(result.ok).toBe(true);
    expect(captured.errors).toHaveLength(0);
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('CLI-02: invalid file (missing jobs) → exitCode 1 + error carries the field path', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });

    const result = await lintCommand.execute(ctx, mockCLIInput({ flags: { path: fixture('invalid.yml') } }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
    // The validation error must mention the offending field (jobs).
    expect(captured.errors.some((e) => /job/i.test(e))).toBe(true);
  });

  it('CLI-03: --json emits parseable { ok:false, files:[...] }', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });

    const result = await lintCommand.execute(
      ctx,
      mockCLIInput({ flags: { path: fixture('invalid.yml'), json: true } }),
    );

    expect(result.ok).toBe(false);
    const payload = captured.json[0] as { ok: boolean; files: Array<{ ok: boolean; errors: string[] }> };
    expect(payload.ok).toBe(false);
    expect(payload.files.length).toBe(1);
    expect(payload.files[0]!.ok).toBe(false);
    expect(payload.files[0]!.errors.length).toBeGreaterThan(0);
  });

  it('CLI-04: directory path lints every file and fails if any is invalid', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });

    const result = await lintCommand.execute(
      ctx,
      mockCLIInput({ flags: { path: fixturesDir, json: true } }),
    );

    expect(result.ok).toBe(false);
    const payload = captured.json[0] as { ok: boolean; files: Array<{ relativePath: string; ok: boolean }> };
    expect(payload.files.length).toBe(2);
    expect(payload.files.some((f) => f.ok)).toBe(true);
    expect(payload.files.some((f) => !f.ok)).toBe(true);
  });

  it('CLI-05: --strict on a valid file still passes (no warnings to promote)', async () => {
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });

    const result = await lintCommand.execute(
      ctx,
      mockCLIInput({ flags: { path: fixture('valid.yml'), strict: true } }),
    );

    expect(result.ok).toBe(true);
  });
});
