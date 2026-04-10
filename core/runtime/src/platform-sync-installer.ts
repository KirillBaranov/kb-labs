/**
 * @module @kb-labs/core-runtime/platform-sync-installer
 * Minimal package installer interface used by `platformSync` in reconcile mode.
 *
 * This stays deliberately thin: it has no knowledge of the marketplace lock,
 * no post-install hooks, no manifest caching. Its only job is "get this exact
 * version of this package into <root>/node_modules/<name>".
 *
 * Separating this from `marketplace-npm` lets `core-runtime` avoid a hard
 * dependency on execa / marketplace service while still allowing callers to
 * inject a richer installer if they need one.
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface PackageInstallRequest {
  /** Directory that owns the target `node_modules/` */
  root: string;
  /** Package name (e.g. `@kb-labs/adapters-openai`) */
  name: string;
  /** Exact version to install */
  version: string;
}

export interface PackageInstallResult {
  /** Absolute path to the installed package root */
  resolvedPath: string;
}

export interface PackageInstaller {
  /**
   * Install the requested package into `<root>/node_modules/<name>`.
   *
   * Must be idempotent: calling twice with the same arguments is a no-op
   * when the target is already present at the requested version.
   *
   * Must reject with a descriptive error on failure — callers surface the
   * message to users and CI logs verbatim.
   */
  install(request: PackageInstallRequest): Promise<PackageInstallResult>;
}

// ---------------------------------------------------------------------------
// pnpm implementation
// ---------------------------------------------------------------------------

export interface PnpmInstallerOptions {
  /** Override the pnpm binary (default: `pnpm` from PATH) */
  pnpmBin?: string;
  /** Extra environment variables to pass to the pnpm process */
  env?: NodeJS.ProcessEnv;
}

/**
 * Create a `PackageInstaller` that shells out to `pnpm add`.
 *
 * Uses `pnpm add <name>@<version> --prod` inside the target root. This
 * respects the target's own `pnpm-lock.yaml` / `package.json` when present
 * (which is what we want for deploy bundles — pnpm will coalesce with
 * anything already declared).
 */
export function createPnpmInstaller(options: PnpmInstallerOptions = {}): PackageInstaller {
  const pnpmBin = options.pnpmBin ?? 'pnpm';

  return {
    async install({ root, name, version }) {
      const spec = `${name}@${version}`;
      const absRoot = path.resolve(root);

      // Fast path: already installed at the right version.
      const targetPkgRoot = path.join(absRoot, 'node_modules', name);
      try {
        const pkgJsonRaw = await fs.readFile(path.join(targetPkgRoot, 'package.json'), 'utf8');
        const pkgJson = JSON.parse(pkgJsonRaw) as { version?: string };
        if (pkgJson.version === version) {
          return { resolvedPath: targetPkgRoot };
        }
      } catch {
        // Not installed — fall through and run pnpm.
      }

      await runPnpm(pnpmBin, ['add', spec, '--prod'], absRoot, options.env);

      // Verify the install landed where we expect.
      try {
        await fs.access(path.join(targetPkgRoot, 'package.json'));
      } catch {
        throw new Error(
          `pnpm add ${spec} completed but ${targetPkgRoot}/package.json is missing`,
        );
      }

      return { resolvedPath: targetPkgRoot };
    },
  };
}

function runPnpm(
  pnpmBin: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpmBin, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn ${pnpmBin}: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const tail = (stderr || stdout).trim().split('\n').slice(-20).join('\n');
      reject(
        new Error(
          `${pnpmBin} ${args.join(' ')} exited with code ${code} in ${cwd}\n${tail}`,
        ),
      );
    });
  });
}
