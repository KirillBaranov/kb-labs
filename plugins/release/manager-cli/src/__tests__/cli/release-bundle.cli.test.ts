/**
 * The documented PR 3 verification command, exercised at the command surface:
 *
 *   kb release stage   --intent <intent.json> --json
 *   kb release package --intent <intent.json> --out <dir> --json
 *   kb release seal    --bundle <dir> --json
 *   kb release verify-bundle --bundle <dir> --json
 *
 * Unlike the module-level suite this runs the real packer (`pnpm pack`) and a
 * real external index sealer, so it also covers the parts the injectable
 * interfaces stand in for elsewhere.
 */

import { chmodSync, copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import { afterEach, describe, expect, it } from 'vitest';

import packageCommand from '../../cli/commands/package.js';
import sealCommand from '../../cli/commands/seal.js';
import stageCommand from '../../cli/commands/stage.js';
import verifyBundleCommand from '../../cli/commands/verify-bundle.js';
import { discardStaging } from '../../shared/bundle/stage.js';
import { createReleaseFixture, type ReleaseFixture } from '../../shared/__tests__/fixtures/release-workspace.js';

const created: ReleaseFixture[] = [];

afterEach(() => {
  for (const fixture of created.splice(0)) {
    try { discardStaging(fixture.repoRoot, fixture.intent.candidateId); } catch { /* already gone */ }
    rmSync(join(fixture.repoRoot, '..'), { recursive: true, force: true });
  }
});

/**
 * A stand-in for `kb-create-release-index` invoked exactly as the real binary
 * is: an executable taking `--input`, `--manifest-root` and `--output`.
 */
function writeSealerBin(dir: string): string {
  const path = join(dir, 'fake-release-index-sealer.mjs');
  writeFileSync(path, [
    '#!/usr/bin/env node',
    "import { readFileSync, writeFileSync } from 'node:fs';",
    'const args = process.argv.slice(2);',
    'const value = name => args[args.indexOf(name) + 1];',
    "const source = JSON.parse(readFileSync(value('--input'), 'utf8'));",
    "writeFileSync(value('--output'), JSON.stringify({ schema: 'kb.create.release-index/v2', ...source }, null, 2) + '\\n');",
    '',
  ].join('\n'));
  chmodSync(path, 0o755);
  return path;
}

function context(cwd: string) {
  const { ui, captured } = createCapturedUI();
  return { ctx: createMockContext({ ui, cwd }) as never, captured };
}

function payload<T>(captured: { json: unknown[] }): T {
  return (captured.json[0] as { result: T }).result;
}

describe('release bundle commands', () => {
  it('RB-01: stage → package → seal → verify-bundle runs end to end and reseals to the same digest', async () => {
    const fixture = createReleaseFixture();
    created.push(fixture);
    const bundleDir = join(fixture.repoRoot, '..', 'bundle');
    const sealerBin = writeSealerBin(join(fixture.repoRoot, '..'));

    const stage = context(fixture.repoRoot);
    const stageResult = await stageCommand.execute(
      stage.ctx,
      mockCLIInput({ flags: { intent: fixture.intentPath, json: true } }),
    );
    expect(stageResult.ok).toBe(true);
    const staged = payload<{ treeSha256: string; worktree: string }>(stage.captured);
    expect(staged.treeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(staged.worktree)).toBe(true);

    const pack = context(fixture.repoRoot);
    const packResult = await packageCommand.execute(
      pack.ctx,
      mockCLIInput({ flags: { intent: fixture.intentPath, out: bundleDir, json: true } }),
    );
    expect(packResult.ok).toBe(true);
    const packaged = payload<{ packages: unknown[]; treeSha256: string }>(pack.captured);
    expect(packaged.packages).toHaveLength(6);
    expect(packaged.treeSha256).toBe(staged.treeSha256);

    // Sealing consumes (and removes) the packaging record; keep a copy so the
    // determinism check below can reseal the very same packaged bytes.
    const packagingBackup = join(fixture.repoRoot, '..', 'packaging.json');
    copyFileSync(join(bundleDir, 'packaging.json'), packagingBackup);

    const seal = context(fixture.repoRoot);
    const sealResult = await sealCommand.execute(
      seal.ctx,
      mockCLIInput({
        flags: {
          bundle: bundleDir,
          channel: 'canary',
          'platform-member-packages': '@kb-labs/core-contracts',
          'sealer-bin': sealerBin,
          json: true,
        },
      }),
    );
    expect(sealResult.ok).toBe(true);
    const sealed = payload<{ bundleSha256: string; indexSha256: string; treeSha256: string }>(seal.captured);
    expect(sealed.bundleSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sealed.treeSha256).toBe(staged.treeSha256);

    const verify = context(fixture.repoRoot);
    const verifyResult = await verifyBundleCommand.execute(
      verify.ctx,
      mockCLIInput({ flags: { bundle: bundleDir, expectedSha256: sealed.bundleSha256, json: true } }),
    );
    expect(verifyResult.ok).toBe(true);

    // Re-sealing the same packaged bytes must land on the same digest. Only
    // the tarballs are non-reproducible (npm embeds mtimes), so they are reused
    // rather than re-packed — that boundary is exactly what the plugin owns
    // versus what the packer does.
    const provenanceBefore = readFileSync(join(bundleDir, 'provenance.json'), 'utf8');
    copyFileSync(packagingBackup, join(bundleDir, 'packaging.json'));

    const reseal = context(fixture.repoRoot);
    const resealResult = await sealCommand.execute(
      reseal.ctx,
      mockCLIInput({
        flags: {
          bundle: bundleDir,
          channel: 'canary',
          'platform-member-packages': '@kb-labs/core-contracts',
          'sealer-bin': sealerBin,
          json: true,
        },
      }),
    );

    expect(resealResult.ok).toBe(true);
    const resealed = payload<{ bundleSha256: string }>(reseal.captured);
    const stripSealedAt = (json: string): string => json.replace(/"sealedAt": "[^"]+"/, '"sealedAt": "<fixed>"');
    expect(stripSealedAt(readFileSync(join(bundleDir, 'provenance.json'), 'utf8')))
      .toBe(stripSealedAt(provenanceBefore));
    expect(resealed.bundleSha256).toBe(sealed.bundleSha256);
  }, 120_000);

  it('RB-02: package without a prior stage fails with the remedy in the message', async () => {
    const fixture = createReleaseFixture();
    created.push(fixture);
    const { ctx, captured } = context(fixture.repoRoot);

    const result = await packageCommand.execute(
      ctx,
      mockCLIInput({ flags: { intent: fixture.intentPath, out: join(fixture.repoRoot, '..', 'b'), json: true } }),
    );

    expect(result.ok).toBe(false);
    expect((captured.json[0] as { error: string }).error).toMatch(/run `kb release stage/);
  });

  it('RB-03: each command refuses to guess a missing required flag', async () => {
    const fixture = createReleaseFixture();
    created.push(fixture);

    for (const [command, flags] of [
      [stageCommand, {}],
      [packageCommand, { intent: fixture.intentPath }],
      [sealCommand, {}],
    ] as const) {
      const { ctx, captured } = context(fixture.repoRoot);
      const result = await command.execute(ctx, mockCLIInput({ flags: { ...flags, json: true } }));
      expect(result.ok).toBe(false);
      expect((captured.json[0] as { error: string }).error).toMatch(/requires --/);
    }
  });
});
