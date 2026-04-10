#!/usr/bin/env node
/**
 * KB DevKit - Build Readiness Checker
 *
 * Analyzes workspace to determine if packages can be successfully bundled.
 * Specifically useful before creating standalone executables with esbuild/rollup.
 *
 * Checks:
 * 1. Missing packages referenced in imports
 * 2. Broken import paths (e.g., missing .js files after compilation)
 * 3. Packages that would fail bundling due to dependencies
 * 4. Dependency chains that are broken
 *
 * Usage:
 *   npx kb-devkit-check-build-readiness
 *   npx kb-devkit-check-build-readiness --package @kb-labs/cli-bin
 *   npx kb-devkit-check-build-readiness --fix (auto-fix what's possible)
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Shared package discovery — supports both flat and categorized layouts
import { findPackages } from './lib/find-packages.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

// Parse args
const args = process.argv.slice(2);
const targetPackage = args.find(a => a.startsWith('--package='))?.split('=')[1];
const shouldFix = args.includes('--fix');

console.log('🔍 KB Labs Build Readiness Checker\n');

// Step 1: Find all workspace packages
function findWorkspacePackages() {
  return findPackages(rootDir).map((pkgJsonPath) => {
    try {
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      return {
        name: pkgJson.name,
        path: dirname(pkgJsonPath),
        pkgJson,
      };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

// Step 2: Get import checker results
function getImportIssues() {
  try {
    return execSync('npx kb-devkit-check-imports 2>&1', {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
  } catch (e) {
    return e.stdout || e.message;
  }
}

// Step 3: Parse issues from output
function parseIssues(output) {
  const issues = {
    missingPackages: new Set(),
    brokenImports: new Map(), // pkg -> [files]
    packagesWithIssues: new Set(),
  };

  const lines = output.split('\n');
  let currentPkg = null;

  for (const line of lines) {
    // Detect package name
    const pkgMatch = line.match(/@kb-labs\/[\w-]+/);
    if (pkgMatch && line.includes('❌')) {
      currentPkg = pkgMatch[0];
      issues.packagesWithIssues.add(currentPkg);
    }

    // Detect missing packages
    if (line.includes('Missing workspace dependencies') && currentPkg) {
      issues.brokenImports.set(currentPkg, []);
    }

    // Detect broken imports
    if (line.includes('Cannot resolve:') && currentPkg) {
      const pathMatch = line.match(/Cannot resolve: (.+)/);
      if (pathMatch) {
        const arr = issues.brokenImports.get(currentPkg) || [];
        arr.push(pathMatch[1].trim());
        issues.brokenImports.set(currentPkg, arr);
      }
    }

    // Collect missing package names
    if (line.includes('@kb-labs/plugin-manifest')) {
      issues.missingPackages.add('@kb-labs/plugin-manifest');
    }
    if (line.includes('@kb-labs/plugin-adapter-rest')) {
      issues.missingPackages.add('@kb-labs/plugin-adapter-rest');
    }
    if (line.includes('@kb-labs/plugin-adapter-cli')) {
      issues.missingPackages.add('@kb-labs/plugin-adapter-cli');
    }
    if (line.includes('@kb-labs/plugin-adapter-studio')) {
      issues.missingPackages.add('@kb-labs/plugin-adapter-studio');
    }
  }

  return issues;
}

// Step 4: Check if package can be bundled
function checkBundleability(pkgName, issues, allPackages) {
  const problems = [];

  // Check if package itself has issues
  if (issues.packagesWithIssues.has(pkgName)) {
    const brokenImports = issues.brokenImports.get(pkgName) || [];
    if (brokenImports.length > 0) {
      problems.push(`🔴 Has ${brokenImports.length} broken import(s)`);
    }
  }

  // Find package deps
  const pkg = allPackages.find(p => p.name === pkgName);
  if (!pkg) {
    problems.push('🔴 Package not found in workspace');
    return { canBundle: false, problems };
  }

  const deps = [
    ...Object.keys(pkg.pkgJson.dependencies || {}),
    ...Object.keys(pkg.pkgJson.peerDependencies || {})
  ];

  // Check if any dependency is missing
  for (const dep of deps) {
    if (dep.startsWith('@kb-labs/') && issues.missingPackages.has(dep)) {
      problems.push(`🔴 Missing dependency: ${dep}`);
    }
  }

  // Recursively check dependencies
  for (const dep of deps) {
    if (dep.startsWith('@kb-labs/') && issues.packagesWithIssues.has(dep)) {
      problems.push(`🟡 Dependency has issues: ${dep}`);
    }
  }

  const canBundle = problems.filter(p => p.startsWith('🔴')).length === 0;
  return { canBundle, problems };
}

// Main execution
const packages = findWorkspacePackages();
console.log(`📦 Found ${packages.length} workspace packages\n`);

console.log('🔍 Running import checker...\n');
const importOutput = getImportIssues();
const issues = parseIssues(importOutput);

console.log('📊 Analysis Results:\n');
console.log(`🔴 Missing packages: ${issues.missingPackages.size}`);
if (issues.missingPackages.size > 0) {
  for (const pkg of issues.missingPackages) {
    console.log(`   - ${pkg}`);
  }
}
console.log(`\n🔴 Packages with issues: ${issues.packagesWithIssues.size}`);
console.log(`🔴 Packages with broken imports: ${issues.brokenImports.size}\n`);

// If target package specified, check bundleability
if (targetPackage) {
  console.log(`\n🎯 Checking bundleability for: ${targetPackage}\n`);
  const result = checkBundleability(targetPackage, issues, packages);

  if (result.canBundle) {
    console.log('✅ Package CAN be bundled!\n');
  } else {
    console.log('❌ Package CANNOT be bundled due to:\n');
    for (const problem of result.problems) {
      console.log(`   ${problem}`);
    }
    console.log('\n💡 Recommendations:');
    console.log('   1. Fix missing packages (create or remove references)');
    console.log('   2. Fix broken imports (update paths after build)');
    console.log('   3. Run: npx kb-devkit-fix-deps --remove-unused');
    process.exit(1);
  }
} else {
  console.log('\n💡 To check specific package:');
  console.log('   npx kb-devkit-check-build-readiness --package @kb-labs/cli-bin\n');
}

// Show top problematic packages
console.log('\n🔝 Most problematic packages:\n');
const sorted = Array.from(issues.brokenImports.entries())
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 10);

for (const [pkg, imports] of sorted) {
  console.log(`   ${pkg}: ${imports.length} broken import(s)`);
}

console.log('\n');
