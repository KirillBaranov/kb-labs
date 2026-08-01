/**
 * Verify a packed tarball actually installs — and imports — in a clean,
 * outside-the-workspace consumer. This is the strongest guarantee available:
 * it catches everything the static findForbiddenDependencyProtocols() check
 * can (a literal workspace:/link:/file: protocol) PLUS classes that check
 * can't, most importantly an already-published PEER dependency that is
 * itself broken (npm auto-installs peers, so a bad manifest several levels
 * deep in someone else's graph fails this package's install too).
 *
 * Uses @npmcli/arborist directly instead of shelling out to `npm install`.
 * npm's own CLI catches this exact failure mode (EUNSUPPORTEDPROTOCOL from
 * npm-package-arg, thrown deep inside Arborist's ideal-tree build) as an
 * unhandled rejection and just sets a bare exit code — no "npm error ..."
 * line, nothing in the debug log beyond "verbose exit 1". Calling Arborist
 * ourselves gets the real Error object with a real, readable message instead
 * of a dead end that takes an hour of manual repro to explain (confirmed
 * live against @kb-labs/sdk@2.115.0 and @kb-labs/plugin-execution-factory@2.114.0).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface CleanInstallResult {
  ok: boolean;
  /** Human-readable reason, always populated when ok is false. */
  error?: string;
}

/**
 * Install `tarballPath` into a throwaway consumer project (outside the
 * monorepo workspace, so pnpm's workspace resolution can't mask a problem)
 * and confirm `packageName` can actually be imported afterward.
 */
export async function verifyCleanInstall(
  tarballPath: string,
  packageName: string,
  additionalTarballs: string[] = [],
): Promise<CleanInstallResult> {
  // Lazy import: @npmcli/arborist is a heavy, npm-internal package only
  // needed on this one verification path.
  const { Arborist } = await import('@npmcli/arborist');

  const consumerDir = mkdtempSync(join(tmpdir(), 'kb-clean-install-'));
  try {
    writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({ name: 'kb-release-consumer', private: true }) + '\n');

    const arb = new Arborist({ path: consumerDir, ignoreScripts: true });
    try {
      await arb.reify({ add: [tarballPath, ...additionalTarballs], save: false });
    } catch (err) {
      return { ok: false, error: `install failed: ${describeArboristError(err)}` };
    }

    const importCheck = spawnSync(
      'node',
      ['--input-type=module', '-e', 'await import(process.argv[1])', packageName],
      { cwd: consumerDir, stdio: 'pipe', timeout: 15_000 },
    );
    if (importCheck.status !== 0) {
      const stderr = importCheck.stderr?.toString().trim();
      return { ok: false, error: `clean consumer cannot import ${packageName}${stderr ? `: ${stderr}` : ''}` };
    }

    return { ok: true };
  } finally {
    rmSync(consumerDir, { recursive: true, force: true });
  }
}

/**
 * Arborist errors are plain Error instances with a useful .message and,
 * for npm-package-arg failures, a .code (e.g. EUNSUPPORTEDPROTOCOL). Surface
 * both — the code alone ("EUNSUPPORTEDPROTOCOL") is what npm's own debug log
 * would have shown if it hadn't swallowed the message entirely.
 */
function describeArboristError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code ? `[${code}] ${err.message}` : err.message;
  }
  return String(err);
}
