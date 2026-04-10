#!/usr/bin/env node

/**
 * @kb-labs/devkit - Dependency Visualizer
 *
 * Generates visualizations:
 * 1. Dependency graph (who depends on whom)
 * 2. Package size metrics
 * 3. Dependency tree (hierarchical view)
 * 4. Module coupling analysis
 *
 * Usage:
 *   kb-devkit-visualize                     # Show all visualizations
 *   kb-devkit-visualize --graph             # Show dependency graph
 *   kb-devkit-visualize --package cli-core  # Show dependencies of specific package
 *   kb-devkit-visualize --stats             # Show package statistics
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
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  package: args.find((arg) => arg.startsWith('--package='))?.split('=')[1],
  graph: args.includes('--graph'),
  stats: args.includes('--stats'),
  tree: args.includes('--tree'),
  all: !args.includes('--graph') && !args.includes('--stats') && !args.includes('--tree'),
};

/**
 * Build dependency graph
 */
function buildDependencyGraph(packages) {
  const graph = new Map(); // package -> {dependencies, dependents, size}
  const packageInfo = new Map(); // package -> {path, packageJson}

  // First pass: collect all packages
  for (const packagePath of packages) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName || !packageName.startsWith('@kb-labs/')) {continue;}

    const packageDir = path.dirname(packagePath);
    const size = calculatePackageSize(packageDir);

    graph.set(packageName, {
      dependencies: [],
      dependents: [],
      size,
    });

    packageInfo.set(packageName, {
      path: packagePath,
      packageJson,
    });
  }

  // Second pass: build dependency relationships
  for (const [packageName, info] of packageInfo.entries()) {
    const allDeps = {
      ...info.packageJson.dependencies,
      ...info.packageJson.devDependencies,
    };

    for (const dep of Object.keys(allDeps)) {
      if (dep.startsWith('@kb-labs/') && graph.has(dep)) {
        graph.get(packageName).dependencies.push(dep);
        graph.get(dep).dependents.push(packageName);
      }
    }
  }

  return { graph, packageInfo };
}

/**
 * Calculate package size (count of files)
 */
function calculatePackageSize(packageDir) {
  const srcDir = path.join(packageDir, 'src');

  if (!fs.existsSync(srcDir)) {
    return 0;
  }

  let fileCount = 0;
  let lineCount = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        fileCount++;
        const content = fs.readFileSync(fullPath, 'utf-8');
        lineCount += content.split('\n').length;
      }
    }
  }

  walk(srcDir);

  return { fileCount, lineCount };
}

/**
 * Render dependency graph
 */
function renderDependencyGraph(graph, packageInfo, filterPackage) {
  log('\n📊 Dependency Graph:\n', 'blue');

  const packages = Array.from(graph.keys());

  if (filterPackage) {
    // Show dependencies of specific package
    const fullPackageName = packages.find((p) => p.includes(filterPackage));

    if (!fullPackageName) {
      log(`   Package "${filterPackage}" not found\n`, 'red');
      return;
    }

    const { dependencies, dependents } = graph.get(fullPackageName);

    log(`Package: ${fullPackageName}\n`, 'cyan');

    if (dependencies.length > 0) {
      log('  Dependencies (packages this depends on):', 'yellow');
      for (const dep of dependencies) {
        log(`    └─ ${dep}`, 'gray');
      }
      log('');
    } else {
      log('  No dependencies', 'gray');
      log('');
    }

    if (dependents.length > 0) {
      log('  Dependents (packages that depend on this):', 'green');
      for (const dependent of dependents) {
        log(`    └─ ${dependent}`, 'gray');
      }
      log('');
    } else {
      log('  No dependents', 'gray');
      log('');
    }
  } else {
    // Show full graph overview
    log('Packages by dependency count:\n', 'gray');

    const byDependencyCount = packages
      .map((p) => ({
        name: p,
        dependencies: graph.get(p).dependencies.length,
        dependents: graph.get(p).dependents.length,
      }))
      .sort((a, b) => b.dependencies - a.dependencies);

    for (let i = 0; i < Math.min(byDependencyCount.length, 20); i++) {
      const pkg = byDependencyCount[i];
      const depBar = '█'.repeat(Math.min(pkg.dependencies, 30));
      const deptBar = '▓'.repeat(Math.min(pkg.dependents, 30));

      log(`${(i + 1).toString().padStart(3)}. ${pkg.name}`, 'cyan');
      log(`     Deps: ${colors.yellow}${depBar}${colors.reset} ${pkg.dependencies}`, 'gray');
      log(`     Used: ${colors.green}${deptBar}${colors.reset} ${pkg.dependents}`, 'gray');
    }

    if (byDependencyCount.length > 20) {
      log(`\n     ... and ${byDependencyCount.length - 20} more packages`, 'gray');
    }

    log('');
  }
}

/**
 * Render package statistics
 */
function renderPackageStats(graph, packageInfo) {
  log('\n📈 Package Statistics:\n', 'blue');

  const packages = Array.from(graph.keys());
  const stats = packages.map((p) => ({
    name: p,
    ...graph.get(p),
    repo: p.split('/')[1].split('-')[0], // Extract repo name (core, cli, etc.)
  }));

  // Group by repository
  const byRepo = new Map();
  for (const pkg of stats) {
    if (!byRepo.has(pkg.repo)) {
      byRepo.set(pkg.repo, []);
    }
    byRepo.get(pkg.repo).push(pkg);
  }

  log('By Repository:\n', 'gray');

  const repoStats = Array.from(byRepo.entries()).map(([repo, packages]) => ({
    repo,
    count: packages.length,
    totalFiles: packages.reduce((sum, p) => sum + (p.size.fileCount || 0), 0),
    totalLines: packages.reduce((sum, p) => sum + (p.size.lineCount || 0), 0),
  }));

  repoStats.sort((a, b) => b.count - a.count);

  for (const stat of repoStats) {
    log(`  ${stat.repo.padEnd(15)} ${stat.count.toString().padStart(3)} packages`, 'cyan');
    log(`  ${''.padEnd(15)} ${stat.totalFiles.toString().padStart(3)} files, ${stat.totalLines.toLocaleString().padStart(7)} lines`, 'gray');
  }

  log('');

  // Overall stats
  const totalPackages = packages.length;
  const totalDeps = stats.reduce((sum, p) => sum + p.dependencies.length, 0);
  const avgDeps = (totalDeps / totalPackages).toFixed(1);
  const maxDeps = Math.max(...stats.map((p) => p.dependencies.length));
  const totalFiles = stats.reduce((sum, p) => sum + (p.size.fileCount || 0), 0);
  const totalLines = stats.reduce((sum, p) => sum + (p.size.lineCount || 0), 0);

  log('Overall:', 'gray');
  log(`  Total packages:     ${totalPackages}`, 'cyan');
  log(`  Total dependencies: ${totalDeps}`, 'yellow');
  log(`  Average deps/pkg:   ${avgDeps}`, 'yellow');
  log(`  Max dependencies:   ${maxDeps}`, 'yellow');
  log(`  Total files:        ${totalFiles}`, 'green');
  log(`  Total lines:        ${totalLines.toLocaleString()}`, 'green');
  log('');

  // Most depended-on packages
  const mostUsed = stats
    .filter((p) => p.dependents.length > 0)
    .sort((a, b) => b.dependents.length - a.dependents.length)
    .slice(0, 10);

  if (mostUsed.length > 0) {
    log('Most Depended-On Packages:\n', 'gray');

    for (let i = 0; i < mostUsed.length; i++) {
      const pkg = mostUsed[i];
      const bar = '█'.repeat(Math.min(pkg.dependents.length, 40));
      log(`  ${(i + 1).toString().padStart(2)}. ${pkg.name}`, 'cyan');
      log(`      ${colors.green}${bar}${colors.reset} ${pkg.dependents.length} dependents`, 'gray');
    }
    log('');
  }

  // Largest packages
  const largest = stats
    .filter((p) => p.size.lineCount > 0)
    .sort((a, b) => b.size.lineCount - a.size.lineCount)
    .slice(0, 10);

  if (largest.length > 0) {
    log('Largest Packages (by lines of code):\n', 'gray');

    for (let i = 0; i < largest.length; i++) {
      const pkg = largest[i];
      log(`  ${(i + 1).toString().padStart(2)}. ${pkg.name}`, 'cyan');
      log(`      ${pkg.size.lineCount.toLocaleString()} lines, ${pkg.size.fileCount} files`, 'gray');
    }
    log('');
  }

  // Leaf packages (no dependents)
  const leaves = stats.filter((p) => p.dependents.length === 0);

  if (leaves.length > 0) {
    log(`Leaf Packages (${leaves.length} packages with no dependents):\n`, 'gray');

    for (let i = 0; i < Math.min(leaves.length, 10); i++) {
      const pkg = leaves[i];
      log(`  ${(i + 1).toString().padStart(2)}. ${pkg.name}`, 'yellow');
    }

    if (leaves.length > 10) {
      log(`      ... and ${leaves.length - 10} more`, 'gray');
    }

    log('');
  }
}

/**
 * Render dependency tree
 */
function renderDependencyTree(graph, packageInfo, filterPackage) {
  log('\n🌳 Dependency Tree:\n', 'blue');

  const packages = Array.from(graph.keys());

  if (!filterPackage) {
    log('   Specify --package=<name> to see dependency tree\n', 'gray');
    return;
  }

  const fullPackageName = packages.find((p) => p.includes(filterPackage));

  if (!fullPackageName) {
    log(`   Package "${filterPackage}" not found\n`, 'red');
    return;
  }

  const visited = new Set();

  function printTree(packageName, depth = 0, prefix = '', isLast = true) {
    if (visited.has(packageName)) {
      log(`${prefix}${isLast ? '└─' : '├─'} ${packageName} ${colors.gray}(circular)${colors.reset}`, 'yellow');
      return;
    }

    visited.add(packageName);

    const symbol = isLast ? '└─' : '├─';
    const color = depth === 0 ? 'cyan' : 'gray';
    log(`${prefix}${depth > 0 ? symbol : ''} ${packageName}`, color);

    const { dependencies } = graph.get(packageName);

    for (let i = 0; i < dependencies.length; i++) {
      const dep = dependencies[i];
      const isLastDep = i === dependencies.length - 1;
      const newPrefix = depth === 0 ? '  ' : prefix + (isLast ? '  ' : '│ ');

      printTree(dep, depth + 1, newPrefix, isLastDep);
    }

    visited.delete(packageName);
  }

  printTree(fullPackageName);

  log('');
}

/**
 * Main function
 */
function main() {
  const rootDir = process.cwd();

  log('\n🎨 KB Labs Visualizer\n', 'blue');

  if (options.package) {
    log(`Analyzing package: ${options.package}\n`, 'gray');
  } else {
    log('Analyzing all packages...\n', 'gray');
  }

  const packages = findPackages(rootDir, options.package);

  if (packages.length === 0) {
    log('⚠️  No KB Labs packages found', 'yellow');
    log('   Run this command from the monorepo root\n', 'gray');
    process.exit(0);
  }

  log(`Found ${packages.length} package(s)\n`, 'gray');

  // Build dependency graph
  const { graph, packageInfo } = buildDependencyGraph(packages);

  // Render visualizations
  if (options.graph || options.all) {
    renderDependencyGraph(graph, packageInfo, options.package);
  }

  if (options.stats || options.all) {
    renderPackageStats(graph, packageInfo);
  }

  if (options.tree) {
    renderDependencyTree(graph, packageInfo, options.package);
  }

  log('💡 Tips:', 'blue');
  log('   • Use --graph to see dependency relationships', 'gray');
  log('   • Use --stats to see package statistics', 'gray');
  log('   • Use --tree --package=<name> to see dependency tree', 'gray');
  log('   • Use --package=<name> to filter by specific package', 'gray');
  log('');

  process.exit(0);
}

main();
