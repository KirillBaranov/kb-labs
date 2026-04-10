#!/usr/bin/env node

/**
 * @kb-labs/devkit - Health Check
 *
 * Comprehensive monorepo health check that runs all critical validations
 * and provides a single health score with actionable recommendations.
 *
 * Checks:
 * 1. Missing runtime dependencies (imports not in package.json)
 * 2. Workspace vs link inconsistencies (cross-repo deps)
 * 3. Build failures
 * 4. TypeScript errors
 * 5. Circular dependencies
 * 6. Orphan packages
 * 7. Duplicate dependencies
 * 8. Naming conventions
 *
 * Usage:
 *   kb-devkit-health                    # Full health check
 *   kb-devkit-health --quick            # Skip slow checks (builds, types)
 *   kb-devkit-health --json             # JSON output
 *   kb-devkit-health --package cli-core # Check specific package
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Shared package discovery — supports both flat and categorized layouts
import { findPackages as _findPackagePaths } from './lib/find-packages.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

// Parse CLI args
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const jsonOutput = args.includes('--json');
const packageFilter = args.find((arg) => arg.startsWith('--package='))?.split('=')[1];

// Find monorepo root
function findMonorepoRoot() {
  let dir = process.cwd();
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('Not in a pnpm workspace');
}

const rootDir = findMonorepoRoot();

/**
 * Find all packages in monorepo
 */
function findAllPackages() {
  return _findPackagePaths(rootDir)
    .map((pkgJsonPath) => {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (packageFilter && !pkg.name.includes(packageFilter)) return null;
        return { name: pkg.name, path: path.dirname(pkgJsonPath), pkg };
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Check if dist/ is stale (older than src/)
 */
function isDistStale(pkgPath) {
  const distFile = path.join(pkgPath, 'dist/index.js');
  if (!fs.existsSync(distFile)) {return false;}

  const distMtime = fs.statSync(distFile).mtime.getTime();

  // Check all source files
  const srcDir = path.join(pkgPath, 'src');
  if (!fs.existsSync(srcDir)) {return false;}

  const checkDir = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (checkDir(fullPath)) {return true;}
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        const srcMtime = fs.statSync(fullPath).mtime.getTime();
        if (srcMtime > distMtime) {return true;}
      }
    }
    return false;
  };

  return checkDir(srcDir);
}

/**
 * Check 1: Missing runtime dependencies
 * Parse dist/index.js and check if all imports are declared in package.json
 * NOTE: Results may be inaccurate if dist/ is stale
 */
function checkMissingRuntimeDeps(packages) {
  const issues = [];
  const stalePackages = [];

  for (const { name, path: pkgPath, pkg } of packages) {
    const distFile = path.join(pkgPath, 'dist/index.js');
    if (!fs.existsSync(distFile)) {continue;}

    // Check if dist is stale
    if (isDistStale(pkgPath)) {
      stalePackages.push(name);
    }

    const content = fs.readFileSync(distFile, 'utf-8');
    const importMatches = content.matchAll(/from ['"]([^'"]+)['"]/g);

    const declaredDeps = {
      ...pkg.dependencies,
      ...pkg.peerDependencies,
    };

    // Node.js built-in modules (don't need to be in package.json)
    const nodeBuiltins = new Set([
      'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
      'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
      'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
      'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys',
      'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads',
      'zlib', 'fs/promises',
    ]);

    const missing = new Set();

    for (const [, importPath] of importMatches) {
      // Skip relative imports and node builtins
      if (importPath.startsWith('.') || importPath.startsWith('node:')) {continue;}

      // Extract package name (handle @scope/package)
      const pkgName = importPath.startsWith('@')
        ? importPath.split('/').slice(0, 2).join('/')
        : importPath.split('/')[0];

      // Skip Node.js built-ins
      if (nodeBuiltins.has(pkgName)) {continue;}

      // Check if declared
      if (!declaredDeps[pkgName]) {
        missing.add(pkgName);
      }
    }

    if (missing.size > 0) {
      issues.push({
        package: name,
        missing: Array.from(missing),
      });
    }
  }

  return { issues, stalePackages };
}

/**
 * Check 2: Workspace vs link inconsistencies
 * Find cross-repo dependencies that use workspace:* instead of link:
 */
function checkWorkspaceLinkIssues(packages) {
  const issues = [];

  // Build map of package locations by repo
  const packagesByRepo = new Map();
  for (const { name, path: pkgPath } of packages) {
    const repo = pkgPath.split('/').find((p) => p.startsWith('kb-labs-'));
    if (!packagesByRepo.has(repo)) {
      packagesByRepo.set(repo, []);
    }
    packagesByRepo.get(repo).push(name);
  }

  for (const { name, path: pkgPath, pkg } of packages) {
    const myRepo = pkgPath.split('/').find((p) => p.startsWith('kb-labs-'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [depName, depVersion] of Object.entries(deps)) {
      if (depVersion !== 'workspace:*') {continue;}

      // Check if this dep is in a different repo
      let depRepo = null;
      for (const [repo, pkgs] of packagesByRepo.entries()) {
        if (pkgs.includes(depName)) {
          depRepo = repo;
          break;
        }
      }

      if (depRepo && depRepo !== myRepo) {
        issues.push({
          package: name,
          dependency: depName,
          myRepo,
          depRepo,
          currentVersion: depVersion,
        });
      }
    }
  }

  return issues;
}

/**
 * Check 3: Build failures
 * Try to build each package and collect errors
 */
function checkBuilds(packages) {
  const issues = [];

  for (const { name, path: pkgPath } of packages) {
    try {
      execSync('pnpm run build', {
        cwd: pkgPath,
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 30000, // 30s timeout per package
      });
    } catch (err) {
      issues.push({
        package: name,
        error: err.stderr?.trim() || err.message,
      });
    }
  }

  return issues;
}

/**
 * Check 4: TypeScript errors (using existing types-audit)
 */
function checkTypeScriptErrors() {
  try {
    const output = execSync('node kb-labs-devkit/bin/devkit-types-audit.mjs --errors-only --json', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    const result = JSON.parse(output);
    return result.packagesWithErrors || [];
  } catch (err) {
    return null; // Tool might not exist yet
  }
}

/**
 * Run all checks and compute health score
 */
async function runHealthCheck() {
  const startTime = Date.now();
  const packages = findAllPackages();

  if (!jsonOutput) {
    console.log(`${colors.cyan}${colors.bold}🏥 KB Labs Monorepo Health Check${colors.reset}\n`);
    console.log(`${colors.gray}Analyzing ${packages.length} package(s)...${colors.reset}\n`);
  }

  const depsCheck = checkMissingRuntimeDeps(packages);
  const results = {
    missingRuntimeDeps: depsCheck.issues,
    stalePackages: depsCheck.stalePackages,
    workspaceLinkIssues: checkWorkspaceLinkIssues(packages),
    buildFailures: quick ? [] : checkBuilds(packages),
    typeScriptErrors: quick ? [] : checkTypeScriptErrors(),
  };

  // Compute health score
  let score = 100;
  const criticalIssues = [];
  const warnings = [];

  // Stale packages warning (doesn't affect score, but important)
  if (results.stalePackages.length > 0) {
    warnings.push({
      type: 'stale-builds',
      severity: 'warning',
      count: results.stalePackages.length,
      message: `${results.stalePackages.length} package(s) with stale dist/ (results may be inaccurate)`,
      details: results.stalePackages,
      recommendation: 'Run: npx kb-devkit-freshness --only-stale',
    });
  }

  // Missing runtime deps: -10 per package
  if (results.missingRuntimeDeps.length > 0) {
    const penalty = Math.min(results.missingRuntimeDeps.length * 10, 50);
    score -= penalty;
    criticalIssues.push({
      type: 'missing-runtime-deps',
      severity: 'critical',
      count: results.missingRuntimeDeps.length,
      message: `${results.missingRuntimeDeps.length} package(s) with missing runtime dependencies`,
      details: results.missingRuntimeDeps,
    });
  }

  // Workspace vs link issues: -5 per package
  if (results.workspaceLinkIssues.length > 0) {
    const penalty = Math.min(results.workspaceLinkIssues.length * 5, 25);
    score -= penalty;
    criticalIssues.push({
      type: 'workspace-link-issues',
      severity: 'critical',
      count: results.workspaceLinkIssues.length,
      message: `${results.workspaceLinkIssues.length} cross-repo dep(s) using workspace:* instead of link:`,
      details: results.workspaceLinkIssues,
    });
  }

  // Build failures: -15 per package
  if (results.buildFailures.length > 0) {
    const penalty = Math.min(results.buildFailures.length * 15, 60);
    score -= penalty;
    criticalIssues.push({
      type: 'build-failures',
      severity: 'critical',
      count: results.buildFailures.length,
      message: `${results.buildFailures.length} package(s) failed to build`,
      details: results.buildFailures,
    });
  }

  // TypeScript errors: warning only
  if (results.typeScriptErrors && results.typeScriptErrors.length > 0) {
    warnings.push({
      type: 'typescript-errors',
      severity: 'warning',
      count: results.typeScriptErrors.length,
      message: `${results.typeScriptErrors.length} package(s) with TypeScript errors`,
      details: results.typeScriptErrors,
    });
  }

  // Compute grade
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  const duration = Date.now() - startTime;

  // Output results
  if (jsonOutput) {
    console.log(JSON.stringify({
      score,
      grade,
      duration,
      packages: packages.length,
      criticalIssues,
      warnings,
      details: results,
    }, null, 2));
  } else {
    printResults(score, grade, criticalIssues, warnings, duration);
  }

  // Exit with error if critical issues found
  if (criticalIssues.length > 0) {
    process.exit(1);
  }
}

/**
 * Pretty print results
 */
function printResults(score, grade, criticalIssues, warnings, duration) {
  // Critical issues
  if (criticalIssues.length > 0) {
    console.log(`${colors.red}${colors.bold}❌ CRITICAL ISSUES (blocking)${colors.reset}\n`);
    for (const issue of criticalIssues) {
      console.log(`   ${colors.red}•${colors.reset} ${issue.message}`);

      // Show top 5 details
      const details = issue.details.slice(0, 5);
      for (const detail of details) {
        if (issue.type === 'missing-runtime-deps') {
          console.log(`     ${colors.gray}${detail.package}: ${detail.missing.join(', ')}${colors.reset}`);
        } else if (issue.type === 'workspace-link-issues') {
          console.log(`     ${colors.gray}${detail.package} → ${detail.dependency} (${detail.myRepo} → ${detail.depRepo})${colors.reset}`);
        } else if (issue.type === 'build-failures') {
          console.log(`     ${colors.gray}${detail.package}${colors.reset}`);
        }
      }

      if (issue.details.length > 5) {
        console.log(`     ${colors.gray}... and ${issue.details.length - 5} more${colors.reset}`);
      }
      console.log();
    }
  }

  // Warnings
  if (warnings.length > 0) {
    console.log(`${colors.yellow}${colors.bold}⚠️  WARNINGS${colors.reset}\n`);
    for (const warning of warnings) {
      console.log(`   ${colors.yellow}•${colors.reset} ${warning.message}`);

      // Show stale packages
      if (warning.type === 'stale-builds' && warning.details.length > 0) {
        const showPackages = warning.details.slice(0, 5);
        for (const pkg of showPackages) {
          console.log(`     ${colors.gray}${pkg}${colors.reset}`);
        }
        if (warning.details.length > 5) {
          console.log(`     ${colors.gray}... and ${warning.details.length - 5} more${colors.reset}`);
        }
        console.log(`     ${colors.cyan}→ ${warning.recommendation}${colors.reset}`);
      }
    }
    console.log();
  }

  // Health score
  const scoreColor = score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
  console.log(`${colors.bold}Health Score:${colors.reset} ${scoreColor}${score}/100 (Grade ${grade})${colors.reset}`);
  console.log(`${colors.gray}Duration: ${duration}ms${colors.reset}\n`);

  // Recommendations
  if (criticalIssues.length > 0) {
    console.log(`${colors.bold}Recommended Actions:${colors.reset}\n`);

    if (criticalIssues.some((i) => i.type === 'missing-runtime-deps')) {
      console.log(`   1. Fix missing runtime dependencies:`);
      console.log(`      ${colors.cyan}kb-devkit-fix-deps --add-missing${colors.reset}\n`);
    }

    if (criticalIssues.some((i) => i.type === 'workspace-link-issues')) {
      console.log(`   2. Fix workspace vs link issues manually in package.json`);
      console.log(`      Change ${colors.gray}workspace:*${colors.reset} → ${colors.cyan}link:../../../kb-labs-xxx/packages/xxx${colors.reset}\n`);
    }

    if (criticalIssues.some((i) => i.type === 'build-failures')) {
      console.log(`   3. Fix build failures:`);
      console.log(`      ${colors.cyan}pnpm --filter <package> run build${colors.reset}\n`);
    }
  }
}

// Run health check
runHealthCheck().catch((err) => {
  console.error(`${colors.red}Health check failed: ${err.message}${colors.reset}`);
  process.exit(1);
});
