#!/usr/bin/env node

/**
 * @kb-labs/devkit - Core Platform Gate
 *
 * Checks if the 6 core platform monorepos meet quality requirements.
 * Reads from the last `pnpm qa` run (.qa-history/history.json) — no recompilation.
 *
 * Core monorepos (from stabilization.md):
 *   kb-labs-cli, kb-labs-core, kb-labs-shared,
 *   kb-labs-sdk, kb-labs-rest-api, kb-labs-plugin
 *
 * Requirements for core:
 *   build  → zero failures
 *   types  → zero errors
 *   lint   → zero errors
 *
 * Flow:
 *   pnpm qa          # run checks (auto-saves to history)
 *   pnpm core:gate   # inspect core result
 *
 * Usage:
 *   kb-devkit-core-gate             # gate check
 *   kb-devkit-core-gate --verbose   # show failing packages
 *   kb-devkit-core-gate --json      # JSON output
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const verbose = args.includes('--verbose');

// Core monorepos — matches stabilization.md
const CORE_REPOS = [
  'kb-labs-cli',
  'kb-labs-core',
  'kb-labs-shared',
  'kb-labs-sdk',
  'kb-labs-rest-api',
  'kb-labs-plugin',
];

function findMonorepoRoot() {
  let dir = process.cwd();
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('Not in a pnpm workspace');
}

/**
 * Build map: package name → repo name, for core repos only.
 */
function buildCorePackageMap(rootDir) {
  const map = new Map();
  for (const repo of CORE_REPOS) {
    const repoDir = path.join(rootDir, repo, 'packages');
    if (!fs.existsSync(repoDir)) continue;
    for (const entry of fs.readdirSync(repoDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgJsonPath = path.join(repoDir, entry.name, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) continue;
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (pkg.name) map.set(pkg.name, repo);
      } catch { /* skip */ }
    }
  }
  return map;
}

/**
 * Read the last-run.json written by `pnpm qa` after each run.
 * Falls back to null if no run has happened yet.
 */
function readLastQaRun(rootDir) {
  const lastRunPath = path.join(rootDir, '.qa-cache', 'last-run.json');
  if (!fs.existsSync(lastRunPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(lastRunPath, 'utf-8'));
  } catch { return null; }
}

function runGate() {
  const rootDir = findMonorepoRoot();
  const corePackageMap = buildCorePackageMap(rootDir);

  if (corePackageMap.size === 0) {
    console.error(`${colors.red}Could not find any core packages. Run from monorepo root.${colors.reset}`);
    process.exit(1);
  }

  const lastRun = readLastQaRun(rootDir);

  if (!lastRun) {
    console.error(`${colors.red}No QA run found. Run ${colors.cyan}pnpm qa${colors.red} first.${colors.reset}`);
    process.exit(1);
  }

  const runAge = Math.round((Date.now() - new Date(lastRun.timestamp).getTime()) / 60000);
  const failedPackages = lastRun.failedPackages ?? {};

  const buildFailed = new Set(failedPackages.build ?? []);
  const typesFailed = new Set(failedPackages.typeCheck ?? failedPackages.types ?? []);
  const lintFailed  = new Set(failedPackages.lint ?? []);

  // Per-repo rollup
  const repoResults = {};
  for (const repo of CORE_REPOS) {
    repoResults[repo] = {
      build: { pass: true, packages: [] },
      types: { pass: true, packages: [] },
      lint:  { pass: true, packages: [] },
    };
  }

  for (const [pkgName, repo] of corePackageMap) {
    if (buildFailed.has(pkgName)) {
      repoResults[repo].build.pass = false;
      repoResults[repo].build.packages.push(pkgName);
    }
    if (typesFailed.has(pkgName)) {
      repoResults[repo].types.pass = false;
      repoResults[repo].types.packages.push(pkgName);
    }
    if (lintFailed.has(pkgName)) {
      repoResults[repo].lint.pass = false;
      repoResults[repo].lint.packages.push(pkgName);
    }
  }

  const allPass = CORE_REPOS.every(repo => {
    const r = repoResults[repo];
    return r.build.pass && r.types.pass && r.lint.pass;
  });

  // JSON output
  if (jsonOutput) {
    console.log(JSON.stringify({
      pass: allPass,
      runAge,
      timestamp: lastRun.timestamp,
      commit: lastRun.git?.commit,
      repos: repoResults,
    }, null, 2));
    process.exit(allPass ? 0 : 1);
  }

  // Human output
  console.log(`\n${colors.bold}${colors.cyan}Platform Core Gate${colors.reset}`);
  const commitInfo = lastRun.git?.commit ? `  ${colors.dim}·  ${lastRun.git.commit.slice(0, 9)}${colors.reset}` : '';
  console.log(`${colors.dim}Last qa run: ${runAge}m ago${colors.reset}${commitInfo}`);
  console.log();

  const colRepo  = 22;
  const colCheck = 9;
  console.log(`${colors.dim}  ${'Monorepo'.padEnd(colRepo)}${'Build'.padEnd(colCheck)}${'Types'.padEnd(colCheck)}${'Lint'.padEnd(colCheck)}${colors.reset}`);
  console.log(`${colors.dim}  ${'─'.repeat(colRepo + colCheck * 3)}${colors.reset}`);

  for (const repo of CORE_REPOS) {
    const r = repoResults[repo];
    const repoPass = r.build.pass && r.types.pass && r.lint.pass;

    const icon    = repoPass ? `${colors.green}✅${colors.reset}` : `${colors.red}❌${colors.reset}`;
    const buildS  = r.build.pass ? `${colors.green}pass${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    const typesS  = r.types.pass ? `${colors.green}pass${colors.reset}` : `${colors.red}${r.types.packages.length}pkg${colors.reset}`;
    const lintS   = r.lint.pass  ? `${colors.green}pass${colors.reset}` : `${colors.red}${r.lint.packages.length}pkg${colors.reset}`;

    const repoLabel  = `${icon} ${repo}`;
    const visibleLen = 3 + repo.length;
    const pad        = ' '.repeat(Math.max(0, colRepo - visibleLen + 2));

    // Each colored string adds ~9 invisible chars — pad accordingly
    console.log(`  ${repoLabel}${pad}${buildS.padEnd(colCheck + 9)}${typesS.padEnd(colCheck + 9)}${lintS}`);

    if (verbose && !repoPass) {
      for (const p of r.build.packages)  console.log(`${colors.dim}      build  ${p}${colors.reset}`);
      for (const p of r.types.packages)  console.log(`${colors.dim}      types  ${p}${colors.reset}`);
      for (const p of r.lint.packages)   console.log(`${colors.dim}      lint   ${p}${colors.reset}`);
    }
  }

  console.log();

  if (allPass) {
    console.log(`${colors.green}${colors.bold}✅ Core is stable. Ready for release.${colors.reset}`);
  } else {
    const failCount = CORE_REPOS.filter(r => {
      const res = repoResults[r];
      return !res.build.pass || !res.types.pass || !res.lint.pass;
    }).length;
    console.log(`${colors.red}${colors.bold}❌ Core is NOT stable. ${failCount} repo(s) failing.${colors.reset}`);
    if (!verbose) {
      console.log(`${colors.dim}   Run with --verbose to see failing packages.${colors.reset}`);
    }
    console.log(`${colors.dim}   After fixing — run: pnpm qa && pnpm core:gate${colors.reset}`);
  }

  console.log();
  process.exit(allPass ? 0 : 1);
}

try {
  runGate();
} catch (err) {
  console.error(`${colors.red}Gate failed: ${err.message}${colors.reset}`);
  process.exit(1);
}
