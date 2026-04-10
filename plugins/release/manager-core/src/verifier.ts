/**
 * Package verifier — npm pack → extract → verify artifacts before publish.
 * Catches: directory imports, test file leaks, missing exports, syntax errors.
 */

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import type { VerifyResult, PackageVersion } from './types';

/**
 * Verify all packages in a plan are publishable.
 */
export async function verifyPackages(
  packages: PackageVersion[],
  options?: {
    logger?: { info?: (...args: any[]) => void };
    onProgress?: (pkg: string, result: VerifyResult) => void;
  },
): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];

  for (const pkg of packages) {
    const result = verifyPackage(pkg.path, pkg.name);
    results.push(result);
    options?.onProgress?.(pkg.name, result);
  }

  return results;
}

/**
 * Verify a single package is publishable.
 * npm pack → extract → check exports, directory imports, test leaks, syntax.
 */
export function verifyPackage(packagePath: string, packageName?: string): VerifyResult {
  const pkgJsonPath = join(packagePath, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    return { name: packageName ?? packagePath, success: true, issues: [] }; // skip
  }

  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  const name = packageName ?? pkg.name ?? packagePath;

  // Skip private packages
  if (pkg.private) {
    return { name, success: true, issues: [] };
  }

  if (!existsSync(join(packagePath, 'dist'))) {
    return { name, success: true, issues: [] }; // no dist = not built yet
  }

  const issues: string[] = [];
  const tmpDir = join(tmpdir(), `kb-verify-${randomBytes(6).toString('hex')}`);

  try {
    mkdirSync(tmpDir, { recursive: true });

    // 1. npm pack (with link: → * replacement)
    const origPkg = readFileSync(pkgJsonPath, 'utf-8');
    const modPkg = JSON.parse(origPkg);
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const deps = modPkg[section];
      if (!deps) {continue;}
      for (const [k, v] of Object.entries(deps)) {
        if (typeof v === 'string' && (v as string).startsWith('link:')) {
          deps[k] = '*';
        }
      }
    }
    writeFileSync(pkgJsonPath, JSON.stringify(modPkg, null, 2) + '\n');

    let tgzFile: string | undefined;
    try {
      execSync(`npm pack --pack-destination ${tmpDir}`, { cwd: packagePath, stdio: 'pipe', timeout: 30_000 });
      const files = readdirSync(tmpDir).filter(f => f.endsWith('.tgz'));
      tgzFile = files[0] ? join(tmpDir, files[0]) : undefined;
    } finally {
      // Always restore original package.json
      writeFileSync(pkgJsonPath, origPkg);
    }

    if (!tgzFile) {
      issues.push('npm pack produced no tarball');
      return { name, success: false, issues };
    }

    // 2. Extract
    execSync(`tar xzf ${tgzFile}`, { cwd: tmpDir, stdio: 'pipe' });
    const extractedDir = join(tmpDir, 'package');

    // 3. Test file leaks
    const testFiles = findFiles(join(extractedDir, 'dist'), f =>
      f.includes('.spec.') || f.includes('.test.') || f.includes('__tests__')
    );
    if (testFiles.length > 0) {
      issues.push(`Test files in dist/: ${testFiles.slice(0, 3).join(', ')}`);
    }

    // 4. Exports exist
    const extractedPkg = JSON.parse(readFileSync(join(extractedDir, 'package.json'), 'utf-8'));
    for (const field of ['main', 'module', 'types'] as const) {
      const val = extractedPkg[field];
      if (val && !existsSync(join(extractedDir, val))) {
        issues.push(`${field}: ${val} does not exist in published package`);
      }
    }

    if (extractedPkg.exports) {
      checkExportsExist(extractedPkg.exports, extractedDir, 'exports', issues);
    }

    // 5. Directory imports in ESM entry
    const esmEntry = resolveEsmEntry(extractedPkg);
    if (esmEntry) {
      const esmPath = join(extractedDir, esmEntry);
      if (existsSync(esmPath)) {
        checkDirectoryImports(esmPath, join(extractedDir, 'dist'), issues);

        // Syntax check
        try {
          execSync(`node --check ${esmPath}`, { stdio: 'pipe', timeout: 10_000 });
        } catch {
          issues.push(`ESM syntax error in ${esmEntry}`);
        }
      }
    }

    // 6. CJS syntax check
    const cjsEntry = resolveCjsEntry(extractedPkg);
    if (cjsEntry) {
      const cjsPath = join(extractedDir, cjsEntry);
      if (existsSync(cjsPath)) {
        try {
          execSync(`node --check ${cjsPath}`, { stdio: 'pipe', timeout: 10_000 });
        } catch {
          issues.push(`CJS syntax error in ${cjsEntry}`);
        }
      }
    }
  } catch (err) {
    issues.push(`Verification error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  return { name, success: issues.length === 0, issues };
}

function resolveEsmEntry(pkg: any): string | undefined {
  return pkg.exports?.['.']?.import ?? pkg.module ?? pkg.main;
}

function resolveCjsEntry(pkg: any): string | undefined {
  const req = pkg.exports?.['.']?.require;
  if (req) {return req;}
  if (pkg.main?.endsWith('.cjs')) {return pkg.main;}
  return undefined;
}

function checkExportsExist(exports: any, baseDir: string, prefix: string, issues: string[]): void {
  if (typeof exports === 'string') {
    // Skip wildcard patterns like "./dist/*" — can't verify statically
    if (exports.includes('*')) { return; }
    if (!existsSync(join(baseDir, exports))) {
      issues.push(`${prefix}: ${exports} missing`);
    }
  } else if (exports && typeof exports === 'object') {
    for (const [k, v] of Object.entries(exports)) {
      // Skip wildcard export keys like "./dist/*"
      if (k.includes('*')) { continue; }
      checkExportsExist(v, baseDir, `${prefix}.${k}`, issues);
    }
  }
}

function checkDirectoryImports(filePath: string, distDir: string, issues: string[]): void {
  const content = readFileSync(filePath, 'utf-8');
  const importRegex = /(?:export|import)\s.*?from\s+['"](\.[^'"]*)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    const target = match[1];
    if (!target || target.includes('.')) {continue;} // has extension, ok
    const targetPath = resolve(dirname(filePath), target);
    if (existsSync(targetPath) && statSync(targetPath).isDirectory()) {
      issues.push(`Directory import '${target}' in ${filePath.split('/').pop()}`);
    }
  }
}

function findFiles(dir: string, predicate: (f: string) => boolean): string[] {
  if (!existsSync(dir)) {return [];}
  const results: string[] = [];
  function walk(d: string) {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) {walk(full);}
        else if (predicate(full)) {results.push(entry.name);}
      }
    } catch { /* skip */ }
  }
  walk(dir);
  return results;
}
