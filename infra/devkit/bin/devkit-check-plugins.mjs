#!/usr/bin/env node

/**
 * KB Labs DevKit - Plugin Entry Checker
 *
 * Validates plugin entry packages against the reference structure (devlink-entry).
 * A package is considered a plugin entry if it has a "kb.manifest" field.
 *
 * Checks:
 *   1. sideEffects: false
 *   2. description field
 *   3. main + types top-level fields
 *   4. ./plugin-manifest in exports
 *   5. kb.manifest field
 *
 * Usage:
 *   kb-devkit-check-plugins                    # Check all plugin entries
 *   kb-devkit-check-plugins --fix              # Auto-fix what's possible
 *   kb-devkit-check-plugins --package @kb-labs/review-entry
 *   kb-devkit-check-plugins --verbose
 *   kb-devkit-check-plugins --json
 *   kb-devkit-check-plugins --ci
 */

import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── discovery ───────────────────────────────────────────────────────────────

function findWorkspaceRoot(cwd = process.cwd()) {
  let current = cwd;
  while (current !== '/') {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    current = dirname(current);
  }
  return cwd;
}

function collectPackages(root) {
  const packages = [];

  const walk = (dir) => {
    if (dir.includes('node_modules') || dir.includes('/dist')) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = join(dir, entry.name);
      const pkgJsonPath = join(fullPath, 'package.json');
      if (existsSync(pkgJsonPath)) {
        try {
          const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
          if (pkgJson.name?.startsWith('@kb-labs/')) {
            packages.push({ name: pkgJson.name, path: fullPath, pkgJson, pkgJsonPath });
          }
        } catch {}
      }
      walk(fullPath);
    }
  };

  walk(root);
  return packages;
}

// Plugin entries live in plugins/*/entry/ (not adapters, not app-packages, not daemons).
// Adapter packages also carry kb.manifest but are a separate category.
function isPluginEntry(pkg) {
  if (!pkg.pkgJson.kb?.manifest) return false;
  const normalised = pkg.path.replace(/\\/g, '/');
  return /\/plugins\/[^/]+\/entry$/.test(normalised);
}

// ─── checker ─────────────────────────────────────────────────────────────────

function checkPlugin(pkg) {
  const issues = [];
  const warnings = [];
  const { pkgJson } = pkg;

  // 1. sideEffects: false
  if (!('sideEffects' in pkgJson)) {
    issues.push({
      type: 'missing-sideEffects',
      severity: 'error',
      message: 'Missing "sideEffects": false — required for tree-shaking',
      fix: () => { pkgJson.sideEffects = false; },
    });
  } else if (pkgJson.sideEffects !== false) {
    warnings.push({
      type: 'wrong-sideEffects',
      severity: 'warning',
      message: `"sideEffects" is ${JSON.stringify(pkgJson.sideEffects)}, expected false`,
    });
  }

  // 2. description
  if (!pkgJson.description) {
    issues.push({
      type: 'missing-description',
      severity: 'error',
      message: 'Missing "description" field',
    });
  }

  // 3. main + types (top-level, for older tooling compatibility)
  if (!pkgJson.main) {
    issues.push({
      type: 'missing-main',
      severity: 'error',
      message: 'Missing top-level "main" field',
      fix: () => { pkgJson.main = './dist/index.js'; },
    });
  }
  if (!pkgJson.types) {
    issues.push({
      type: 'missing-types',
      severity: 'error',
      message: 'Missing top-level "types" field',
      fix: () => { pkgJson.types = './dist/index.d.ts'; },
    });
  }

  // 4. ./plugin-manifest in exports
  const exports_ = pkgJson.exports || {};
  if (!('./plugin-manifest' in exports_)) {
    issues.push({
      type: 'missing-plugin-manifest-export',
      severity: 'error',
      message: 'Missing "./plugin-manifest" in exports — required for plugin discovery',
      fix: () => {
        if (!pkgJson.exports) pkgJson.exports = {};
        pkgJson.exports['./plugin-manifest'] = {
          types: './dist/manifest.d.ts',
          import: './dist/manifest.js',
        };
      },
    });
  }

  // 5. kb.manifest
  if (!pkgJson.kb?.manifest) {
    issues.push({
      type: 'missing-kb-manifest',
      severity: 'error',
      message: 'Missing "kb.manifest" field — required for plugin registration',
      fix: () => {
        pkgJson.kb = { ...(pkgJson.kb || {}), manifest: './dist/manifest.js' };
      },
    });
  }

  return { issues, warnings };
}

// ─── fixer ───────────────────────────────────────────────────────────────────

async function fixPlugin(pkg, issues) {
  const fixable = issues.filter((i) => typeof i.fix === 'function');
  if (fixable.length === 0) return false;

  for (const issue of fixable) issue.fix();

  await writeFile(pkg.pkgJsonPath, JSON.stringify(pkg.pkgJson, null, 2) + '\n', 'utf-8');
  return true;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    fix: args.includes('--fix'),
    verbose: args.includes('--verbose'),
    json: args.includes('--json'),
    ci: args.includes('--ci'),
    package: args.find((a) => a.startsWith('--package='))?.split('=')[1],
  };

  const root = findWorkspaceRoot();
  let packages = collectPackages(root).filter(isPluginEntry);

  if (flags.package) {
    packages = packages.filter((p) => p.name === flags.package);
    if (packages.length === 0) {
      console.error(`\n❌ Plugin entry package "${flags.package}" not found\n`);
      process.exit(1);
    }
  }

  if (!flags.json && !flags.ci) {
    console.log('\n🔌 KB Labs Plugin Entry Checker\n');
    console.log(`Found ${packages.length} plugin entry package(s)\n`);
  }

  const results = [];
  let totalIssues = 0;
  let totalWarnings = 0;

  for (const pkg of packages) {
    const { issues, warnings } = checkPlugin(pkg);
    totalIssues += issues.length;
    totalWarnings += warnings.length;

    let fixed = false;
    if (flags.fix && issues.length > 0) {
      fixed = await fixPlugin(pkg, issues);
    }
    results.push({ pkg, issues, warnings, fixed });
  }

  // ── json output ────────────────────────────────────────────────────────────
  if (flags.json) {
    console.log(JSON.stringify({
      packages: results.map((r) => ({
        name: r.pkg.name,
        path: relative(root, r.pkg.path),
        issues: r.issues.length,
        warnings: r.warnings.length,
        fixed: r.fixed,
        details: {
          issues: r.issues.map(({ fix: _fix, ...rest }) => rest),
          warnings: r.warnings,
        },
      })),
      summary: {
        total: packages.length,
        withIssues: results.filter((r) => r.issues.length > 0).length,
        withWarnings: results.filter((r) => r.warnings.length > 0).length,
        fixed: results.filter((r) => r.fixed).length,
      },
    }, null, 2));
    if (flags.ci && totalIssues > 0) process.exit(1);
    return;
  }

  // ── human output ───────────────────────────────────────────────────────────
  if (totalIssues > 0) {
    const affected = results.filter((r) => r.issues.length > 0);
    console.log(`🔴 Issues: ${totalIssues} error(s) in ${affected.length} package(s)\n`);
    for (const { pkg, issues } of affected) {
      console.log(`   ${pkg.name}`);
      for (const issue of issues) {
        const fixable = typeof issue.fix === 'function' ? ' [auto-fixable]' : ' [manual]';
        console.log(`      ${issue.message}${flags.verbose ? fixable : ''}`);
      }
      console.log();
    }
  }

  if (totalWarnings > 0 && flags.verbose) {
    console.log(`⚠️  Warnings: ${totalWarnings} non-critical issue(s)\n`);
    for (const { pkg, warnings } of results.filter((r) => r.warnings.length > 0)) {
      console.log(`   ${pkg.name}`);
      for (const w of warnings) console.log(`      ${w.message}`);
      console.log();
    }
  }

  if (totalIssues === 0 && totalWarnings === 0) {
    console.log('✅ All plugin entry packages are compliant!\n');
  } else if (flags.fix) {
    const fixedCount = results.filter((r) => r.fixed).length;
    const unfixable = results.filter((r) =>
      r.issues.some((i) => typeof i.fix !== 'function')
    );
    console.log(`✅ Fixed ${fixedCount} package(s)\n`);
    if (unfixable.length > 0) {
      console.log('⚠️  Manual fixes still required:\n');
      for (const { pkg, issues } of unfixable) {
        const manual = issues.filter((i) => typeof i.fix !== 'function');
        if (manual.length === 0) continue;
        console.log(`   ${pkg.name}`);
        for (const issue of manual) console.log(`      ${issue.message}`);
        console.log();
      }
    }
  } else {
    console.log('\n💡 Run with --fix to automatically fix auto-fixable issues\n');
    console.log('   Note: "description" requires a manual fix\n');
  }

  if (flags.ci && totalIssues > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
