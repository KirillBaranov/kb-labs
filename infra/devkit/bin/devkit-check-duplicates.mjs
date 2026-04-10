#!/usr/bin/env node

/**
 * @kb-labs/devkit - Duplicate Checker
 *
 * Checks for:
 * 1. Duplicate dependencies (same package, different versions)
 * 2. Version mismatches across packages
 * 3. Duplicate code patterns (similar file names/content)
 * 4. Redundant similar packages
 *
 * Usage:
 *   kb-devkit-check-duplicates                    # Check all packages
 *   kb-devkit-check-duplicates --package cli-core # Check specific package
 *   kb-devkit-check-duplicates --code             # Include code duplication check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared package discovery — supports both flat and categorized layouts
import { findPackages } from './lib/find-packages.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  package: args.find((arg) => arg.startsWith('--package='))?.split('=')[1],
  code: args.includes('--code'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

/**
 * Collect all dependencies from all packages
 */
function collectDependencies(packages) {
  const dependencyMap = new Map(); // dep -> [{package, version}]

  for (const packagePath of packages) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName || !packageName.startsWith('@kb-labs/')) {continue;}

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };

    for (const [dep, version] of Object.entries(allDeps)) {
      // Skip workspace packages and local links
      if (version.startsWith('workspace:') || version.startsWith('link:')) {
        continue;
      }

      if (!dependencyMap.has(dep)) {
        dependencyMap.set(dep, []);
      }

      dependencyMap.get(dep).push({
        package: packageName,
        version,
        path: packagePath,
      });
    }
  }

  return dependencyMap;
}

/**
 * Find duplicate versions of dependencies
 */
function findDuplicateVersions(dependencyMap) {
  const duplicates = [];

  for (const [dep, usages] of dependencyMap.entries()) {
    // Get unique versions
    const versions = new Set(usages.map((u) => u.version));

    if (versions.size > 1) {
      // Group by version
      const byVersion = new Map();
      for (const usage of usages) {
        if (!byVersion.has(usage.version)) {
          byVersion.set(usage.version, []);
        }
        byVersion.get(usage.version).push(usage.package);
      }

      duplicates.push({
        dependency: dep,
        versions: Array.from(byVersion.entries()).map(([version, packages]) => ({
          version,
          packages,
          count: packages.length,
        })),
        totalPackages: usages.length,
      });
    }
  }

  // Sort by number of packages affected (most impactful first)
  duplicates.sort((a, b) => b.totalPackages - a.totalPackages);

  return duplicates;
}

/**
 * Find outdated common dependencies
 */
function findOutdatedCommon(dependencyMap) {
  const outdated = [];

  for (const [dep, usages] of dependencyMap.entries()) {
    if (usages.length < 3) {continue;} // Only check widely-used deps

    const versions = usages.map((u) => u.version);
    const uniqueVersions = new Set(versions);

    if (uniqueVersions.size === 1) {continue;} // All same version

    // Try to determine which version is newest (simple semver comparison)
    const sortedVersions = Array.from(uniqueVersions).sort((a, b) => {
      // Remove ^ and ~ prefixes for comparison
      const cleanA = a.replace(/^[\^~]/, '');
      const cleanB = b.replace(/^[\^~]/, '');

      return cleanB.localeCompare(cleanA, undefined, { numeric: true });
    });

    const newestVersion = sortedVersions[0];
    const outdatedUsages = usages.filter((u) => u.version !== newestVersion);

    if (outdatedUsages.length > 0) {
      outdated.push({
        dependency: dep,
        newestVersion,
        outdatedUsages: outdatedUsages.map((u) => ({
          package: u.package,
          version: u.version,
        })),
        totalAffected: outdatedUsages.length,
      });
    }
  }

  // Sort by impact
  outdated.sort((a, b) => b.totalAffected - a.totalAffected);

  return outdated;
}

/**
 * Find similar file names across packages (potential code duplication)
 */
function findSimilarFiles(packages) {
  const fileMap = new Map(); // filename -> [{package, path}]

  for (const packagePath of packages) {
    const packageDir = path.dirname(packagePath);
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName || !packageName.startsWith('@kb-labs/')) {continue;}

    const srcDir = path.join(packageDir, 'src');
    if (!fs.existsSync(srcDir)) {continue;}

    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          // Skip test files and common names
          if (
            entry.name.includes('.test.') ||
            entry.name.includes('.spec.') ||
            entry.name === 'index.ts' ||
            entry.name === 'index.tsx' ||
            entry.name === 'index.js'
          ) {
            continue;
          }

          if (!fileMap.has(entry.name)) {
            fileMap.set(entry.name, []);
          }

          fileMap.get(entry.name).push({
            package: packageName,
            path: path.relative(packageDir, fullPath),
          });
        }
      }
    }

    walk(srcDir);
  }

  // Find files that appear in multiple packages
  const duplicates = [];

  for (const [filename, locations] of fileMap.entries()) {
    if (locations.length > 1) {
      duplicates.push({
        filename,
        locations,
        count: locations.length,
      });
    }
  }

  // Sort by frequency
  duplicates.sort((a, b) => b.count - a.count);

  return duplicates;
}

/**
 * Main function
 */
function main() {
  const rootDir = process.cwd();

  log('\n🔍 KB Labs Duplicate Checker\n', 'blue');

  if (options.package) {
    log(`Checking package: ${options.package}\n`, 'gray');
  } else {
    log('Checking all packages...\n', 'gray');
  }

  if (options.code) {
    log('📁 Code duplication check enabled\n', 'cyan');
  }

  const packages = findPackages(rootDir, options.package);

  if (packages.length === 0) {
    log('⚠️  No KB Labs packages found', 'yellow');
    log('   Run this command from the monorepo root\n', 'gray');
    process.exit(0);
  }

  log(`Found ${packages.length} package(s) to check\n`, 'gray');

  // Collect dependencies
  const dependencyMap = collectDependencies(packages);
  log(`Analyzing ${dependencyMap.size} unique dependencies...\n`, 'gray');

  // Find duplicate versions
  const duplicates = findDuplicateVersions(dependencyMap);

  // Find outdated common deps
  const outdated = findOutdatedCommon(dependencyMap);

  // Find similar files (if enabled)
  let similarFiles = [];
  if (options.code) {
    log('Scanning for code duplication patterns...\n', 'gray');
    similarFiles = findSimilarFiles(packages);
  }

  // Print results
  let hasIssues = false;

  // Print duplicate versions
  if (duplicates.length > 0) {
    hasIssues = true;
    log('🔴 Duplicate Dependencies (Different Versions):\n', 'red');

    for (let i = 0; i < duplicates.length; i++) {
      const dup = duplicates[i];
      log(`${i + 1}. ${dup.dependency}`, 'yellow');
      log(`   Used by ${dup.totalPackages} package(s) with ${dup.versions.length} different versions:`, 'gray');

      for (const ver of dup.versions) {
        log(`   • ${ver.version} (${ver.count} package(s))`, 'cyan');
        if (options.verbose) {
          for (const pkg of ver.packages.slice(0, 3)) {
            log(`     - ${pkg}`, 'gray');
          }
          if (ver.packages.length > 3) {
            log(`     ... and ${ver.packages.length - 3} more`, 'gray');
          }
        }
      }

      log('', 'gray');
    }

    log('   💡 Different versions can lead to:' , 'blue');
    log('      - Larger bundle sizes (multiple copies bundled)', 'gray');
    log('      - Type conflicts and build errors', 'gray');
    log('      - Runtime bugs from version incompatibilities', 'gray');
    log('   💡 Run: pnpm dedupe or align versions manually\n', 'blue');
  }

  // Print outdated common dependencies
  if (outdated.length > 0 && options.verbose) {
    hasIssues = true;
    log('🟡 Outdated Common Dependencies:\n', 'yellow');

    for (let i = 0; i < Math.min(outdated.length, 10); i++) {
      const dep = outdated[i];
      log(`${i + 1}. ${dep.dependency}`, 'yellow');
      log(`   Latest: ${dep.newestVersion}`, 'green');
      log(`   ${dep.totalAffected} package(s) using older versions:`, 'gray');

      for (const usage of dep.outdatedUsages.slice(0, 3)) {
        log(`   • ${usage.package}: ${usage.version}`, 'gray');
      }

      if (dep.outdatedUsages.length > 3) {
        log(`   ... and ${dep.outdatedUsages.length - 3} more`, 'gray');
      }

      log('', 'gray');
    }

    log('   💡 Consider upgrading to the latest version for consistency\n', 'blue');
  }

  // Print similar files (code duplication)
  if (similarFiles.length > 0) {
    hasIssues = true;
    log('🟠 Potential Code Duplication (Similar File Names):\n', 'yellow');

    for (let i = 0; i < Math.min(similarFiles.length, 15); i++) {
      const file = similarFiles[i];
      log(`${i + 1}. ${file.filename}`, 'yellow');
      log(`   Found in ${file.count} package(s):`, 'gray');

      for (const loc of file.locations) {
        log(`   • ${loc.package}`, 'cyan');
        log(`     ${loc.path}`, 'gray');
      }

      log('', 'gray');
    }

    log('   ⚠️  This may indicate duplicated code that could be shared', 'yellow');
    log('   💡 Consider extracting common code to a shared package\n', 'blue');
  }

  // Summary
  log('─'.repeat(60) + '\n', 'gray');

  if (!hasIssues) {
    log('✅ No duplicate dependencies found!\n', 'green');
    process.exit(0);
  }

  log('📊 Summary:\n', 'blue');

  if (duplicates.length > 0) {
    log(`   🔴 ${duplicates.length} dependencies with version conflicts`, 'red');
  }
  if (outdated.length > 0 && options.verbose) {
    log(`   🟡 ${outdated.length} common dependencies with outdated versions`, 'yellow');
  }
  if (similarFiles.length > 0) {
    log(`   🟠 ${similarFiles.length} potential code duplication patterns`, 'yellow');
  }

  log('\n💡 Tips:', 'blue');
  log('   • Use --verbose to see full package lists and outdated deps', 'gray');
  log('   • Use --code to check for code duplication patterns', 'gray');
  log('   • Run: pnpm dedupe to resolve version conflicts', 'gray');
  log('   • Consider using pnpm overrides for enforcing versions', 'gray');
  log('');

  process.exit(1);
}

main();
