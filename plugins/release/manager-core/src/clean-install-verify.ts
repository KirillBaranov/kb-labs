/**
 * Verify a packed tarball actually installs — and imports — in a clean,
 * outside-the-workspace consumer. This is the strongest guarantee available:
 * it catches everything the static findForbiddenDependencyProtocols() check
 * can (a literal workspace:/link:/file: protocol) PLUS classes that check
 * can't, most importantly an already-published PEER dependency that is
 * itself broken (npm auto-installs peers, so a bad manifest several levels
 * deep in someone else's graph fails this package's install too).
 *
 * The package manager is configurable. pnpm is the platform default and is
 * used for the monorepo release flow; npm remains available for projects that
 * explicitly publish with npm.
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
  packageManager: 'pnpm' | 'npm' = 'npm',
): Promise<CleanInstallResult> {
  const consumerDir = mkdtempSync(join(tmpdir(), 'kb-clean-install-'));
  try {
    writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({ name: 'kb-release-consumer', private: true }) + '\n');

    if (packageManager === 'pnpm') {
      const install = spawnSync(
        'pnpm',
        ['add', '--ignore-scripts', '--no-lockfile', '--config.auto-install-peers=true', tarballPath, ...additionalTarballs],
        { cwd: consumerDir, stdio: 'pipe', timeout: 120_000 },
      );
      if (install.status !== 0) {
        return { ok: false, error: `install failed: ${describeProcessFailure(install)}` };
      }
    } else {
      // Lazy import: Arborist is only needed for the explicit npm path.
      const { Arborist } = await import('@npmcli/arborist');
      const arb = new Arborist({ path: consumerDir, ignoreScripts: true });
      try {
        await arb.reify({ add: [tarballPath, ...additionalTarballs], save: false });
      } catch (err) {
        return { ok: false, error: `install failed: ${describeArboristError(err)}` };
      }
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

function describeProcessFailure(result: { stderr?: Buffer | string; stdout?: Buffer | string; status: number | null }): string {
  const stderr = result.stderr?.toString().trim();
  const stdout = result.stdout?.toString().trim();
  return stderr || stdout || `package manager exited with code ${result.status ?? 'unknown'}`;
}
