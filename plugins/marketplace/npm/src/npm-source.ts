/**
 * @module @kb-labs/marketplace-npm/npm-source
 * pnpm-based PackageSource implementation.
 * This is the ONLY place in the marketplace codebase that calls pnpm.
 */

import { execa } from 'execa';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import type {
  PackageSource,
  ResolvedPackage,
  InstalledPackage,
} from '@kb-labs/marketplace-contracts';

export class NpmPackageSource implements PackageSource {
  async resolve(spec: string): Promise<ResolvedPackage> {
    const id = extractPackageName(spec);
    if (!id) {
      throw new Error(`Invalid package spec: ${spec}`);
    }

    return {
      id,
      version: extractVersion(spec) ?? 'latest',
      integrity: '', // computed after install
      source: 'marketplace',
    };
  }

  async install(
    pkg: ResolvedPackage,
    root: string,
    opts?: { dev?: boolean },
  ): Promise<InstalledPackage> {
    const spec = pkg.version === 'latest' ? pkg.id : `${pkg.id}@${pkg.version}`;
    const args = ['add', spec];
    if (opts?.dev) {args.push('--save-dev');}

    await execa('pnpm', args, { cwd: root, timeout: 5 * 60 * 1000 });

    const packageRoot = path.join(root, 'node_modules', pkg.id);

    // Read actual installed version
    let version = pkg.version;
    try {
      const pkgJson = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf-8'));
      version = pkgJson.version ?? version;
    } catch { /* use spec version */ }

    // Compute integrity
    const integrity = await computeIntegrity(packageRoot);

    return {
      id: pkg.id,
      version,
      packageRoot,
      integrity,
    };
  }

  async remove(packageId: string, root: string): Promise<void> {
    await execa('pnpm', ['remove', packageId], { cwd: root, timeout: 2 * 60 * 1000 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPackageName(spec: string): string | null {
  if (!spec || spec.startsWith('.') || spec.startsWith('/')) {return null;}

  if (spec.startsWith('@')) {
    const slashIndex = spec.indexOf('/');
    if (slashIndex === -1) {return null;}
    const versionSep = spec.lastIndexOf('@');
    return versionSep > slashIndex ? spec.slice(0, versionSep) : spec;
  }

  const versionSep = spec.indexOf('@');
  return versionSep > 0 ? spec.slice(0, versionSep) : spec;
}

function extractVersion(spec: string): string | null {
  if (spec.startsWith('@')) {
    const slashIndex = spec.indexOf('/');
    const lastAt = spec.lastIndexOf('@');
    return lastAt > slashIndex ? spec.slice(lastAt + 1) : null;
  }
  const atIndex = spec.indexOf('@');
  return atIndex > 0 ? spec.slice(atIndex + 1) : null;
}

async function computeIntegrity(packageRoot: string): Promise<string> {
  try {
    const content = await fs.readFile(path.join(packageRoot, 'package.json'));
    const hash = crypto.createHash('sha256').update(content).digest('base64');
    return `sha256-${hash}`;
  } catch {
    return '';
  }
}
