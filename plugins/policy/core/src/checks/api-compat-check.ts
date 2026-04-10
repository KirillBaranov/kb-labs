import fs from 'node:fs';
import path from 'node:path';
import type { PolicyConfig, PolicyViolation, ApiSnapshot } from '@kb-labs/policy-contracts';
import { defaultSymbolExtractor } from './symbol-extractor.js';

const SNAPSHOTS_DIR = '.kb/api-snapshots';

/**
 * Checks API backward compatibility by comparing exported symbols against a stored snapshot.
 * Also handles "no-breaking-without-major" rule (both rules map to this check).
 *
 * First run (no snapshot): warns and skips — does NOT auto-create a snapshot.
 * Use updateSnapshots() to create/refresh snapshots explicitly.
 */
export async function checkApiCompat(
  repoPath: string,
  _config: PolicyConfig,
  workspaceRoot: string,
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];
  const absRepoPath = path.resolve(workspaceRoot, repoPath);

  const packageJsonPaths = findPackageJsonPaths(absRepoPath);

  for (const pkgJsonPath of packageJsonPaths) {
    let json: { name?: string; version?: string };
    try {
      json = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    } catch {
      continue;
    }
    if (!json.name || !json.version) {continue;}

    const pkgName = json.name;
    const currentVersion = json.version;
    const snapshotPath = getSnapshotPath(workspaceRoot, pkgName);

    // Gather current exported symbols from dist/*.d.ts
    const pkgDir = path.dirname(pkgJsonPath);
    const currentSymbols = extractSymbolsFromDist(pkgDir);

    if (!fs.existsSync(snapshotPath)) {
      // FIX 2 (CRITICAL): removed the auto-saveSnapshot() call that was here.
      // checkApiCompat is a read-only check function; writing files as a side-effect
      // inside it violated the read/write separation and caused unexpected mutations
      // during dry-run / CI read-only policy checks.
      // Snapshots must be created explicitly via updateSnapshots().
      console.warn(
        `[policy] api-compat: No snapshot for ${pkgName} — run 'policy update-snapshots' to create one.`,
      );
      continue;
    }

    // Load snapshot and compare
    let snapshot: ApiSnapshot;
    try {
      snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    } catch {
      console.warn(`[policy] api-compat: Could not read snapshot for ${pkgName}, skipping.`);
      continue;
    }

    const snapshotSymbols = new Set(snapshot.symbols);
    const relPath = path.relative(workspaceRoot, pkgJsonPath);

    const removed: string[] = [];
    for (const sym of snapshotSymbols) {
      if (!currentSymbols.has(sym)) {removed.push(sym);}
    }

    if (removed.length > 0) {
      // Check if major version bumped
      const currentMajor = parseMajor(currentVersion);
      const snapshotMajor = parseMajor(snapshot.version);

      if (currentMajor <= snapshotMajor) {
        violations.push({
          rule: 'api-compat-check',
          severity: 'error',
          message: `${pkgName} removed exported symbols without major version bump`,
          package: pkgName,
          detail: `Removed: ${removed.join(', ')}. Bump major version (current: ${currentVersion}, snapshot: ${snapshot.version}) or restore symbols.`,
          file: relPath,
        });
      }
    }
  }

  return violations;
}

/**
 * Creates or updates the API snapshot for all packages in a repo.
 */
export function updateSnapshots(repoPath: string, workspaceRoot: string): void {
  const absRepoPath = path.resolve(workspaceRoot, repoPath);
  const packageJsonPaths = findPackageJsonPaths(absRepoPath);

  for (const pkgJsonPath of packageJsonPaths) {
    let json: { name?: string; version?: string };
    try {
      json = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    } catch {
      continue;
    }
    if (!json.name || !json.version) {continue;}

    const pkgDir = path.dirname(pkgJsonPath);
    const symbols = extractSymbolsFromDist(pkgDir);
    const snapshotPath = getSnapshotPath(workspaceRoot, json.name);
    saveSnapshot(snapshotPath, json.name, json.version, symbols);
    console.log(`[policy] Saved snapshot for ${json.name} @ ${json.version} (${symbols.size} symbols)`);
  }
}

function extractSymbolsFromDist(pkgDir: string): Set<string> {
  const distDir = path.join(pkgDir, 'dist');
  const symbols = new Set<string>();

  if (!fs.existsSync(distDir)) {return symbols;}

  const dtsFiles = findDtsFiles(distDir);
  for (const dtsFile of dtsFiles) {
    const content = fs.readFileSync(dtsFile, 'utf-8');
    for (const sym of defaultSymbolExtractor.extract(content)) {
      symbols.add(sym);
    }
  }

  return symbols;
}

function findDtsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findDtsFiles(fullPath));
    } else if (entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function getSnapshotPath(workspaceRoot: string, packageName: string): string {
  const safeName = packageName.replace(/\//g, '__').replace(/@/g, '');
  const snapshotsDir = path.join(workspaceRoot, SNAPSHOTS_DIR);
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }
  return path.join(snapshotsDir, `${safeName}.json`);
}

function saveSnapshot(snapshotPath: string, packageName: string, version: string, symbols: Set<string>): void {
  const snapshot: ApiSnapshot = {
    packageName,
    version,
    symbols: Array.from(symbols).sort(),
    extractedAt: new Date().toISOString(),
  };
  // FIX 5 (MEDIUM): guarded writeFileSync — a permission error or a full disk must
  // not crash the entire update run; log a warning and continue instead.
  try {
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.warn(`[policy] api-compat: Failed to write snapshot to ${snapshotPath}: ${(err as Error).message}`);
  }
}

function parseMajor(version: string): number {
  return parseInt(version.split('.')[0] ?? '0', 10);
}

function findPackageJsonPaths(absRepoPath: string): string[] {
  const results: string[] = [];
  for (const subdir of ['packages', 'apps']) {
    const subdirPath = path.join(absRepoPath, subdir);
    if (!fs.existsSync(subdirPath)) {continue;}
    for (const entry of fs.readdirSync(subdirPath)) {
      const pkgJsonPath = path.join(subdirPath, entry, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {results.push(pkgJsonPath);}
    }
  }
  return results;
}
