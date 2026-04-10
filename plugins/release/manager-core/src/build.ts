/**
 * Safe build — builds into temp dir, then atomically swaps dist/.
 * Prevents crashing running services whose dist/ is wiped by tsup's `clean: true`.
 */

import { rename, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { BuildResult, PackageVersion } from './types';

/**
 * Build all packages in a plan using safe build strategy.
 * Stops on first failure.
 */
export async function buildPackages(
  packages: PackageVersion[],
  options?: {
    logger?: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void };
    onProgress?: (pkg: string, result: BuildResult) => void;
  },
): Promise<BuildResult[]> {
  const results: BuildResult[] = [];

  for (const pkg of packages) {
    options?.logger?.info?.(`Building ${pkg.name}...`);
    const result = await runSafeBuild(pkg.path, pkg.name);
    results.push({ ...result, name: pkg.name });

    options?.onProgress?.(pkg.name, { ...result, name: pkg.name });

    if (!result.success) {
      options?.logger?.error?.(`Build failed for ${pkg.name}: ${result.error}`);
      break;
    }

    options?.logger?.info?.(`Built ${pkg.name} in ${result.durationMs}ms`);
  }

  return results;
}

/**
 * Run build for a single package using safe temp-dir strategy when tsup is detected.
 * Falls back to regular `pnpm run build` for non-tsup packages.
 */
export async function runSafeBuild(packagePath: string, packageName: string): Promise<BuildResult> {
  const usesTsup = existsSync(join(packagePath, 'tsup.config.ts'))
    || existsSync(join(packagePath, 'tsup.config.js'));

  if (usesTsup) {
    return runTsupSafeBuild(packagePath, packageName);
  }

  return runDirectBuild(packagePath, packageName);
}

/**
 * Check if a shell command is a build command that should use safe build.
 */
export function isBuildCommand(command: string, args?: string[]): boolean {
  const full = [command, ...(args ?? [])].join(' ').trim();
  return /\b(pnpm|npm|yarn)\s+(run\s+)?build\b/.test(full);
}

async function runTsupSafeBuild(packagePath: string, packageName: string): Promise<BuildResult> {
  const startTime = Date.now();
  const buildId = randomBytes(6).toString('hex');
  const tempDir = join(tmpdir(), `kb-release-build-${buildId}`);
  const distDir = join(packagePath, 'dist');
  const backupDir = join(packagePath, `dist.bak-${buildId}`);

  try {
    const buildResult = await spawnCommand(`npx tsup -d ${tempDir}`, packagePath);

    if (!buildResult.success) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      return { ...buildResult, name: packageName, durationMs: Date.now() - startTime };
    }

    if (existsSync(distDir)) {
      await rename(distDir, backupDir);
    }

    try {
      await rename(tempDir, distDir);
    } catch {
      await cp(tempDir, distDir, { recursive: true });
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    await rm(backupDir, { recursive: true, force: true }).catch(() => {});
    return { success: true, name: packageName, durationMs: Date.now() - startTime };
  } catch (err) {
    if (existsSync(backupDir) && !existsSync(distDir)) {
      await rename(backupDir, distDir).catch(() => {});
    }
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return {
      success: false,
      name: packageName,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  }
}

async function runDirectBuild(packagePath: string, packageName: string): Promise<BuildResult> {
  const result = await spawnCommand('pnpm run build', packagePath);
  return { ...result, name: packageName };
}

export interface SpawnResult extends Omit<BuildResult, 'name'> {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawn a shell command and collect results.
 * Captures both stdout and stderr — build tools often write errors to stdout.
 */
export function spawnCommand(command: string, cwd: string, timeoutMs = 5 * 60 * 1000): Promise<SpawnResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, [], {
      cwd,
      stdio: 'pipe',
      shell: true,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      const exitCode = code ?? 1;
      const durationMs = Date.now() - startTime;
      if (exitCode === 0) {
        resolve({ success: true, durationMs, stdout, stderr, exitCode });
        return;
      }

      // Build error message from available output (last N lines to keep it readable)
      const combined = (stderr || stdout).trim();
      const tail = combined
        .split('\n')
        .slice(-30)
        .join('\n');

      resolve({
        success: false,
        error: tail || `Build failed with exit code ${exitCode}`,
        durationMs,
        stdout,
        stderr,
        exitCode,
      });
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message, durationMs: Date.now() - startTime, stdout: '', stderr: '', exitCode: 1 });
    });

    setTimeout(() => {
      child.kill();
      resolve({ success: false, error: `Timed out after ${timeoutMs / 1000}s`, durationMs: Date.now() - startTime, stdout: '', stderr: '', exitCode: 1 });
    }, timeoutMs);
  });
}
