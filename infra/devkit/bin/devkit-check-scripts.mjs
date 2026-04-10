#!/usr/bin/env node

/**
 * KB Labs DevKit - Package Scripts Checker
 *
 * Validates that all packages have required scripts and devDependencies.
 * Philosophy: "More is OK, Less is Not"
 */

import { writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Required scripts (all packages MUST have these)
const REQUIRED_SCRIPTS = {
  clean: 'rimraf dist',
  build: 'tsup --config tsup.config.ts',
  dev: 'tsup --config tsup.config.ts --watch',
  lint: 'eslint src --ext .ts',
  'lint:fix': 'eslint src --ext .ts --fix',
  'type-check': 'tsc --noEmit',
  test: 'vitest run',
  'test:watch': 'vitest',
};

// Required devDependencies (all packages MUST have these)
const REQUIRED_DEV_DEPS = {
  '@kb-labs/devkit': 'workspace:*',
  '@types/node': '^24.3.3',
  rimraf: '^6.0.1',
  tsup: '^8.5.0',
  typescript: '^5.6.3',
  vitest: '^3.2.4',
};

// Required fields
const REQUIRED_FIELDS = {
  type: 'module',
  engines: {
    node: '>=20.0.0',
    pnpm: '>=9.0.0',
  },
};

// Find workspace root
function findWorkspaceRoot(cwd = process.cwd()) {
  let current = cwd;
  while (current !== '/') {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = dirname(current);
  }
  return cwd;
}

// Get all workspace packages
async function getWorkspacePackages(root) {
  const packages = [];

  // Find all package.json files
  const findPackages = (dir) => {
    if (dir.includes('node_modules') || dir.includes('dist')) {return;}

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = join(dir, entry.name);
        const pkgJsonPath = join(fullPath, 'package.json');

        if (existsSync(pkgJsonPath)) {
          try {
            const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
            if (pkg.name && pkg.name.startsWith('@kb-labs/')) {
              packages.push({
                name: pkg.name,
                path: fullPath,
                pkgJson: pkg,
                pkgJsonPath,
              });
            }
          } catch {}
        }

        // Recurse into subdirectories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          findPackages(fullPath);
        }
      }
    }
  };

  findPackages(root);
  return packages;
}

// Check package scripts and deps
function checkPackageScripts(pkg) {
  const issues = [];
  const warnings = [];
  const { pkgJson } = pkg;

  const scripts = pkgJson.scripts || {};
  const devDeps = pkgJson.devDependencies || {};

  // Check required scripts
  for (const [name, expectedCmd] of Object.entries(REQUIRED_SCRIPTS)) {
    if (!(name in scripts)) {
      issues.push({
        type: 'missing-script',
        severity: 'error',
        script: name,
        expected: expectedCmd,
        message: `Missing required script: ${name}`,
      });
    }
  }

  // Check required devDependencies
  for (const [name, expectedVersion] of Object.entries(REQUIRED_DEV_DEPS)) {
    if (!(name in devDeps)) {
      issues.push({
        type: 'missing-dev-dep',
        severity: 'error',
        dependency: name,
        expected: expectedVersion,
        message: `Missing required devDependency: ${name}`,
      });
    }
  }

  // Check type: "module"
  if (pkgJson.type !== REQUIRED_FIELDS.type) {
    issues.push({
      type: 'wrong-type',
      severity: 'error',
      expected: REQUIRED_FIELDS.type,
      actual: pkgJson.type,
      message: `type should be "${REQUIRED_FIELDS.type}", got "${pkgJson.type || 'undefined'}"`,
    });
  }

  // Check engines
  const engines = pkgJson.engines || {};
  for (const [name, expectedVersion] of Object.entries(REQUIRED_FIELDS.engines)) {
    if (!(name in engines)) {
      issues.push({
        type: 'missing-engine',
        severity: 'error',
        engine: name,
        expected: expectedVersion,
        message: `Missing required engine: ${name}`,
      });
    } else if (engines[name] !== expectedVersion) {
      warnings.push({
        type: 'wrong-engine-version',
        severity: 'warning',
        engine: name,
        expected: expectedVersion,
        actual: engines[name],
        message: `Engine ${name}: expected ${expectedVersion}, got ${engines[name]}`,
      });
    }
  }

  return { issues, warnings };
}

// Fix package scripts and deps
async function fixPackageScripts(pkg, issues) {
  const { pkgJson, pkgJsonPath } = pkg;
  let modified = false;

  for (const issue of issues) {
    switch (issue.type) {
      case 'missing-script':
        if (!pkgJson.scripts) {pkgJson.scripts = {};}
        pkgJson.scripts[issue.script] = issue.expected;
        modified = true;
        break;

      case 'missing-dev-dep':
        if (!pkgJson.devDependencies) {pkgJson.devDependencies = {};}
        pkgJson.devDependencies[issue.dependency] = issue.expected;
        modified = true;
        break;

      case 'missing-engine':
        if (!pkgJson.engines) {pkgJson.engines = {};}
        pkgJson.engines[issue.engine] = issue.expected;
        modified = true;
        break;

      case 'wrong-type':
        pkgJson.type = issue.expected;
        modified = true;
        break;
    }
  }

  if (modified) {
    await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
  }

  return modified;
}

// Import readFileSync
import { readFileSync } from 'node:fs';

// Main CLI
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
  let packages = await getWorkspacePackages(root);

  if (flags.package) {
    packages = packages.filter((p) => p.name === flags.package);
    if (packages.length === 0) {
      console.error(`\n❌ Package ${flags.package} not found\n`);
      process.exit(1);
    }
  }

  if (!flags.json && !flags.ci) {
    console.log('\n🔍 KB Labs Package Scripts Checker\n');
    console.log(`Found ${packages.length} package(s) to check\n`);
  }

  const results = [];
  let totalIssues = 0;
  let totalWarnings = 0;

  for (const pkg of packages) {
    const { issues, warnings } = checkPackageScripts(pkg);
    totalIssues += issues.length;
    totalWarnings += warnings.length;

    if (flags.fix && issues.length > 0) {
      const fixed = await fixPackageScripts(pkg, issues);
      results.push({ pkg, issues, warnings, fixed });
    } else {
      results.push({ pkg, issues, warnings, fixed: false });
    }
  }

  // Output results
  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          packages: results.map((r) => ({
            name: r.pkg.name,
            path: relative(root, r.pkg.path),
            issues: r.issues.length,
            warnings: r.warnings.length,
            fixed: r.fixed,
            details: {
              issues: r.issues,
              warnings: r.warnings,
            },
          })),
          summary: {
            total: packages.length,
            withIssues: results.filter((r) => r.issues.length > 0).length,
            withWarnings: results.filter((r) => r.warnings.length > 0).length,
            fixed: results.filter((r) => r.fixed).length,
          },
        },
        null,
        2,
      ),
    );
  } else {
    // Print issues
    if (totalIssues > 0) {
      console.log(`🔴 Issues: ${totalIssues} error(s) in ${results.filter((r) => r.issues.length > 0).length} package(s)\n`);
      for (const { pkg, issues } of results.filter((r) => r.issues.length > 0)) {
        console.log(`   ${pkg.name}`);
        for (const issue of issues) {
          console.log(`      ${issue.message}`);
          if (flags.verbose && issue.expected) {
            console.log(`      └─ Expected: ${issue.expected}`);
          }
        }
        console.log();
      }
    }

    // Print warnings
    if (totalWarnings > 0) {
      console.log(`⚠️  Warnings: ${totalWarnings} non-critical issue(s)\n`);
      if (flags.verbose) {
        for (const { pkg, warnings } of results.filter((r) => r.warnings.length > 0)) {
          console.log(`   ${pkg.name}`);
          for (const warning of warnings) {
            console.log(`      ${warning.message}`);
          }
          console.log();
        }
      }
    }

    // Success message
    if (totalIssues === 0 && totalWarnings === 0) {
      console.log('✅ All packages have required scripts and dependencies!\n');
    } else if (flags.fix) {
      console.log(`✅ Fixed ${results.filter((r) => r.fixed).length} package(s)\n`);
      console.log('💡 Run "pnpm install" to install new dependencies\n');
    } else {
      console.log('\n💡 Run with --fix to automatically fix issues\n');
    }
  }

  // Exit code
  if (flags.ci && totalIssues > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
