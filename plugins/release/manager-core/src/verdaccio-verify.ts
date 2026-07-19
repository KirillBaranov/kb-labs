/**
 * Registry-side artifact verification — confirms a package actually landed
 * on a registry (Verdaccio) with the expected content, before it's promoted
 * to npm `latest`.
 *
 * Deliberately separate from verifier.ts: that module is pure local
 * validation (npm pack from the working tree, no registry I/O) so it stays
 * usable offline/in restricted CI. This module does registry round-trips —
 * it's the "did the publish actually work, and is what landed still sane"
 * check that only makes sense to run *after* a publish.
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { isVersionPublished } from './planner';
import { verifyExtractedTarball } from './verifier';
import type { PublishablePackage, VerifyResult, PluginLogger } from './types';

const DEFAULT_TIMEOUT_MS = 30_000;

export interface VerifyAgainstRegistryOptions {
  registry: string;
  /** Timeout (ms) for the registry HTTP check and the `npm pack` round-trip. Default: 30000. */
  timeout?: number;
  logger?: Pick<PluginLogger, 'info' | 'warn'>;
}

/**
 * Verify that each package landed on `registry` at its expected version,
 * and that the tarball actually published there passes the same static
 * checks verifyPackage() runs pre-publish (catches publish-time corruption
 * distinct from pre-publish source issues).
 */
export async function verifyAgainstRegistry(
  packages: PublishablePackage[],
  options: VerifyAgainstRegistryOptions,
): Promise<VerifyResult[]> {
  const { registry, timeout = DEFAULT_TIMEOUT_MS, logger } = options;
  const results: VerifyResult[] = [];

  for (const pkg of packages) {
    results.push(await verifyOneAgainstRegistry(pkg, registry, timeout, logger));
  }

  return results;
}

async function verifyOneAgainstRegistry(
  pkg: PublishablePackage,
  registry: string,
  timeout: number,
  logger?: Pick<PluginLogger, 'info' | 'warn'>,
): Promise<VerifyResult> {
  const published = await isVersionPublished(pkg.name, pkg.version, registry);
  if (!published) {
    return { name: pkg.name, success: false, issues: [`${pkg.name}@${pkg.version} was not found on ${registry} after publish`] };
  }
  logger?.info?.(`${pkg.name}@${pkg.version} confirmed on ${registry}`);

  const tmpDir = join(tmpdir(), `kb-verdaccio-verify-${randomBytes(6).toString('hex')}`);
  const issues: string[] = [];

  try {
    mkdirSync(tmpDir, { recursive: true });

    const spec = `${pkg.name}@${pkg.version}`;
    const packResult = spawnSync(
      'npm',
      ['pack', spec, '--registry', registry, '--pack-destination', tmpDir],
      { stdio: 'pipe', timeout },
    );

    if (packResult.status !== 0) {
      const stderr = packResult.stderr?.toString().trim();
      issues.push(`Could not pull ${spec} back from ${registry} for verification${stderr ? `: ${stderr}` : ''}`);
      return { name: pkg.name, success: false, issues };
    }

    const tgzFile = readdirSync(tmpDir).find(f => f.endsWith('.tgz'));
    if (!tgzFile) {
      issues.push(`npm pack produced no tarball for ${spec} from ${registry}`);
      return { name: pkg.name, success: false, issues };
    }

    spawnSync('tar', ['xzf', tgzFile], { cwd: tmpDir, stdio: 'pipe' });
    const extractedDir = join(tmpDir, 'package');
    if (!existsSync(extractedDir)) {
      issues.push(`Failed to extract tarball for ${spec}`);
      return { name: pkg.name, success: false, issues };
    }

    issues.push(...verifyExtractedTarball(extractedDir));
  } catch (err) {
    issues.push(`Registry verification error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  return { name: pkg.name, success: issues.length === 0, issues };
}
