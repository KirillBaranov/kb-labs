#!/usr/bin/env node

/**
 * @kb-labs/devkit - TypeScript Types Order Calculator
 *
 * Calculates the correct order for TypeScript types generation.
 * Unlike build-order which tracks runtime dependencies, this tracks
 * TYPE dependencies - which types are imported from which packages.
 *
 * This is critical in monorepos because:
 * - ProjectA imports type G from PackageB
 * - PackageB imports type L from PackageM
 * - If PackageM doesn't generate types (dts: false), ProjectA breaks!
 *
 * Usage:
 *   kb-devkit-types-order                   # Show types order
 *   kb-devkit-types-order --layers          # Show parallel layers
 *   kb-devkit-types-order --package=cli     # For specific package
 *   kb-devkit-types-order --broken          # Show only broken chains
 *   kb-devkit-types-order --json            # JSON output
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  if (!options.json) {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  layers: args.includes('--layers'),
  json: args.includes('--json'),
  broken: args.includes('--broken'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  package: args.find((arg) => arg.startsWith('--package='))?.split('=')[1],
};

/**
 * Find all packages (returns objects with path, dir)
 */
function findPackages(rootDir) {
  return _findPackagePaths(rootDir).map((pkgPath) => ({
    path: pkgPath,
    dir: path.dirname(pkgPath),
  }));
}

/**
 * Check if package generates types
 */
function checkTypesGeneration(packageDir) {
  // Check tsup.config.ts for dts setting
  const tsupConfigPath = path.join(packageDir, 'tsup.config.ts');

  if (fs.existsSync(tsupConfigPath)) {
    const content = fs.readFileSync(tsupConfigPath, 'utf-8');

    // Check for dts: false (bad!)
    if (/dts\s*:\s*false/.test(content)) {
      return { generates: false, reason: 'dts: false in tsup.config.ts' };
    }

    // Check for dts: true (good!)
    if (/dts\s*:\s*true/.test(content)) {
      return { generates: true, reason: 'dts: true in tsup.config.ts' };
    }

    // No explicit dts setting - tsup defaults to true
    return { generates: true, reason: 'tsup default (dts: true)' };
  }

  // No tsup config - check if it's a TypeScript package
  const srcDir = path.join(packageDir, 'src');
  if (fs.existsSync(srcDir)) {
    const hasTS = walkDir(srcDir, (file) => /\.(ts|tsx)$/.test(file));
    if (hasTS) {
      return { generates: false, reason: 'No tsup.config.ts found' };
    }
  }

  return { generates: false, reason: 'No TypeScript sources' };
}

/**
 * Walk directory to check for files
 */
function walkDir(dir, predicate) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (walkDir(fullPath, predicate)) {return true;}
    } else if (entry.isFile() && predicate(entry.name)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract type imports from TypeScript files
 * Looks for:
 * - import type { X } from '@kb-labs/...'
 * - import { type X } from '@kb-labs/...'
 * - import { X } from '@kb-labs/...' (might be type or value)
 */
function extractTypeImports(packageDir) {
  const srcDir = path.join(packageDir, 'src');
  if (!fs.existsSync(srcDir)) {return new Set();}

  const typeImports = new Set();

  function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Match import statements
    const importRegex = /import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"](@kb-labs\/[^'"]+)['"]/g;
    const importTypeRegex = /import\s+type\s+(?:{[^}]+}|\*\s+as\s+\w+)\s+from\s+['"](@kb-labs\/[^'"]+)['"]/g;

    let match;

    // Extract from 'import type { ... } from @kb-labs/...'
    while ((match = importTypeRegex.exec(content)) !== null) {
      typeImports.add(match[1]);
    }

    // Extract from 'import { ... } from @kb-labs/...'
    // These might be types or values, but we track them as potential type dependencies
    while ((match = importRegex.exec(content)) !== null) {
      typeImports.add(match[2]);
    }
  }

  function walkFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walkFiles(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        scanFile(fullPath);
      }
    }
  }

  walkFiles(srcDir);
  return typeImports;
}

/**
 * Build types dependency graph
 */
function buildTypesDependencyGraph(packages) {
  const graph = new Map(); // packageName -> { typeDeps: Set, generates: boolean, reason: string }

  // First pass: collect all packages and their types generation status
  for (const { path: packagePath, dir: packageDir } of packages) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName || !packageName.startsWith('@kb-labs/')) {continue;}

    const typesStatus = checkTypesGeneration(packageDir);

    graph.set(packageName, {
      typeDeps: new Set(),
      generates: typesStatus.generates,
      reason: typesStatus.reason,
      dir: packageDir,
    });
  }

  // Second pass: extract type imports
  for (const { path: packagePath, dir: packageDir } of packages) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName || !packageName.startsWith('@kb-labs/')) {continue;}

    const typeImports = extractTypeImports(packageDir);

    for (const dep of typeImports) {
      // Only track workspace type dependencies
      if (dep.startsWith('@kb-labs/') && graph.has(dep)) {
        graph.get(packageName).typeDeps.add(dep);
      }
    }
  }

  return graph;
}

/**
 * Topological sort for types
 */
function topologicalSort(graph) {
  const inDegree = new Map();
  const reverseDeps = new Map();

  for (const [pkg, { typeDeps }] of graph.entries()) {
    if (!inDegree.has(pkg)) {
      inDegree.set(pkg, 0);
    }
    if (!reverseDeps.has(pkg)) {
      reverseDeps.set(pkg, new Set());
    }

    for (const dep of typeDeps) {
      inDegree.set(pkg, (inDegree.get(pkg) || 0) + 1);

      if (!reverseDeps.has(dep)) {
        reverseDeps.set(dep, new Set());
      }
      reverseDeps.get(dep).add(pkg);
    }
  }

  const queue = [];
  for (const [pkg, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(pkg);
    }
  }

  const layers = [];
  const sorted = [];

  while (queue.length > 0) {
    const layer = [...queue];
    layers.push(layer);
    sorted.push(...layer);

    queue.length = 0;

    for (const pkg of layer) {
      for (const dependent of reverseDeps.get(pkg) || []) {
        inDegree.set(dependent, inDegree.get(dependent) - 1);

        if (inDegree.get(dependent) === 0) {
          queue.push(dependent);
        }
      }
    }
  }

  if (sorted.length !== graph.size) {
    const missing = Array.from(graph.keys()).filter((pkg) => !sorted.includes(pkg));
    return { layers, sorted, circular: missing };
  }

  return { layers, sorted, circular: [] };
}

/**
 * Find broken type chains
 * A chain is broken if:
 * 1. Package A imports types from Package B
 * 2. Package B doesn't generate types (dts: false)
 */
function findBrokenChains(graph) {
  const broken = [];

  for (const [pkg, { typeDeps }] of graph.entries()) {
    for (const dep of typeDeps) {
      const depNode = graph.get(dep);

      if (!depNode.generates) {
        broken.push({
          consumer: pkg,
          provider: dep,
          reason: depNode.reason,
        });
      }
    }
  }

  return broken;
}

/**
 * Find circular type dependencies
 */
function findCircularTypeDependencies(graph, circularPackages) {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();
  const path = [];

  function dfs(pkg) {
    if (recursionStack.has(pkg)) {
      const cycleStart = path.indexOf(pkg);
      const cycle = [...path.slice(cycleStart), pkg];

      const cycleKey = cycle.slice(0, -1).sort().join('→');
      if (!cycles.some((c) => c.key === cycleKey)) {
        cycles.push({ cycle, key: cycleKey });
      }
      return;
    }

    if (visited.has(pkg)) {
      return;
    }

    visited.add(pkg);
    recursionStack.add(pkg);
    path.push(pkg);

    const node = graph.get(pkg);
    if (node) {
      for (const dep of node.typeDeps) {
        if (circularPackages.includes(dep)) {
          dfs(dep);
        }
      }
    }

    path.pop();
    recursionStack.delete(pkg);
  }

  for (const pkg of circularPackages) {
    if (!visited.has(pkg)) {
      dfs(pkg);
    }
  }

  return cycles;
}

/**
 * Get types order for specific package
 */
function getTypesOrderForPackage(graph, packageName) {
  const visited = new Set();
  const order = [];

  function visit(pkg) {
    if (visited.has(pkg)) {return;}
    visited.add(pkg);

    const node = graph.get(pkg);
    if (!node) {return;}

    for (const dep of node.typeDeps) {
      visit(dep);
    }

    order.push(pkg);
  }

  visit(packageName);
  return order;
}

/**
 * Print types order
 */
function printTypesOrder(result, graph) {
  log('\n📘 KB Labs TypeScript Types Order\n', 'bold');

  // Check for broken chains first
  const brokenChains = findBrokenChains(graph);

  if (brokenChains.length > 0) {
    log(`❌ Broken Type Chains: ${brokenChains.length}\n`, 'red');

    for (const { consumer, provider, reason } of brokenChains) {
      log(`   ${consumer}`, 'yellow');
      log(`      └─ imports types from: ${provider}`, 'gray');
      log(`      └─ ❌ ${provider} doesn't generate types: ${reason}`, 'red');
      log('', 'reset');
    }

    log('💡 Fix with: npx kb-devkit-check-types --fix\n', 'cyan');
  }

  if (result.circular.length > 0) {
    log('🔄 Circular Type Dependencies\n', 'yellow');

    const cycles = findCircularTypeDependencies(graph, result.circular);

    if (cycles.length > 0) {
      log(`Found ${cycles.length} circular type dependency cycle(s):\n`, 'yellow');

      for (let i = 0; i < cycles.length; i++) {
        const { cycle } = cycles[i];
        log(`${i + 1}. ${cycle.join(' → ')}`, 'red');
        log('', 'reset');
      }
    }

    log('💡 To fix: Break the cycle by extracting shared types into a separate package\n', 'cyan');
  }

  if (brokenChains.length === 0 && result.circular.length === 0) {
    log(`✅ All type chains are healthy!\n`, 'green');
  }

  log(`Found ${result.sorted.length} packages with TypeScript\n`, 'gray');

  if (options.layers) {
    log('📦 Types Generation Layers (parallel):\n', 'blue');

    for (let i = 0; i < result.layers.length; i++) {
      const layer = result.layers[i];
      log(`Layer ${i + 1} (${layer.length} packages):`, 'cyan');

      for (const pkg of layer) {
        const node = graph.get(pkg);
        const status = node.generates ? '✅' : '❌';
        log(`   ${status} ${pkg}`, node.generates ? 'gray' : 'red');

        if (options.verbose && node.typeDeps.size > 0) {
          log(`      type deps: ${Array.from(node.typeDeps).join(', ')}`, 'gray');
        }
      }
      log('', 'reset');
    }

    log(`Total layers: ${result.layers.length}`, 'blue');
    log(`Max parallelism: ${Math.max(...result.layers.map((l) => l.length))} packages\n`, 'blue');
  } else {
    log('📦 Types Generation Order (sequential):\n', 'blue');

    for (let i = 0; i < result.sorted.length; i++) {
      const pkg = result.sorted[i];
      const node = graph.get(pkg);
      const status = node.generates ? '✅' : '❌';

      log(`${(i + 1).toString().padStart(3)}. ${status} ${pkg}`, node.generates ? 'cyan' : 'red');

      if (options.verbose && node.typeDeps.size > 0) {
        log(`      type deps: ${Array.from(node.typeDeps).join(', ')}`, 'gray');
      }
    }
    log('', 'reset');
  }

  // Summary
  log('─'.repeat(60) + '\n', 'gray');
  log('📊 Summary:\n', 'blue');

  const generating = Array.from(graph.values()).filter((n) => n.generates).length;
  const notGenerating = graph.size - generating;

  log(`   Total packages:        ${graph.size}`, 'cyan');
  log(`   ✅ Generating types:   ${generating}`, 'green');
  if (notGenerating > 0) {
    log(`   ❌ Not generating:     ${notGenerating}`, 'red');
  }
  if (brokenChains.length > 0) {
    log(`   🔴 Broken chains:      ${brokenChains.length}`, 'red');
  }
  if (result.circular.length > 0) {
    log(`   🔄 Circular deps:      ${result.circular.length}`, 'yellow');
  }

  log('', 'reset');

  // Tips
  log('💡 Tips:', 'blue');
  log('   • Use --broken to show only broken type chains', 'gray');
  log('   • Use --layers to see parallel generation opportunities', 'gray');
  log('   • Use npx kb-devkit-check-types --fix to fix dts: false', 'gray');
  log('', 'reset');
}

/**
 * Main function
 */
function main() {
  const rootDir = process.cwd();

  if (!options.json) {
    log('\n🚀 KB Labs TypeScript Types Order Calculator\n', 'bold');
  }

  const packages = findPackages(rootDir);

  if (packages.length === 0) {
    log('⚠️  No KB Labs packages found', 'yellow');
    process.exit(0);
  }

  const graph = buildTypesDependencyGraph(packages);

  if (options.broken) {
    // Only show broken chains
    const brokenChains = findBrokenChains(graph);

    if (options.json) {
      console.log(JSON.stringify({ brokenChains }, null, 2));
    } else {
      log('\n❌ Broken Type Chains\n', 'red');

      if (brokenChains.length === 0) {
        log('✅ No broken type chains found!\n', 'green');
      } else {
        for (const { consumer, provider, reason } of brokenChains) {
          log(`   ${consumer}`, 'yellow');
          log(`      └─ imports types from: ${provider}`, 'gray');
          log(`      └─ ❌ ${provider} doesn't generate types: ${reason}`, 'red');
          log('', 'reset');
        }

        log(`\nTotal broken chains: ${brokenChains.length}`, 'red');
        log('💡 Fix with: npx kb-devkit-check-types --fix\n', 'cyan');
      }
    }

    process.exit(brokenChains.length > 0 ? 1 : 0);
  }

  if (options.package) {
    // Types order for specific package
    const fullPackageName = options.package.startsWith('@kb-labs/')
      ? options.package
      : `@kb-labs/${options.package}`;

    if (!graph.has(fullPackageName)) {
      log(`⚠️  Package not found: ${fullPackageName}`, 'yellow');
      log('\nAvailable packages:', 'gray');
      for (const pkg of Array.from(graph.keys()).sort()) {
        log(`   ${pkg}`, 'gray');
      }
      process.exit(1);
    }

    const order = getTypesOrderForPackage(graph, fullPackageName);

    if (options.json) {
      console.log(JSON.stringify({ package: fullPackageName, order }, null, 2));
    } else {
      log(`\n📘 Types generation order for ${fullPackageName}:\n`, 'blue');

      for (let i = 0; i < order.length; i++) {
        const pkg = order[i];
        const node = graph.get(pkg);
        const isCurrent = pkg === fullPackageName;
        const status = node.generates ? '✅' : '❌';

        log(
          `${(i + 1).toString().padStart(3)}. ${status} ${pkg}${isCurrent ? ' ⬅ target' : ''}`,
          isCurrent ? 'yellow' : node.generates ? 'gray' : 'red'
        );
      }
      log('', 'reset');
    }
  }

  // Full types order
  const result = topologicalSort(graph);
  const brokenChains = findBrokenChains(graph);

  if (!options.package && !options.broken) {
    if (options.json) {
      const output = {
        total: graph.size,
        layers: result.layers,
        sorted: result.sorted,
        circular: result.circular,
        brokenChains,
        stats: {
          generating: Array.from(graph.values()).filter((n) => n.generates).length,
          notGenerating: Array.from(graph.values()).filter((n) => !n.generates).length,
          brokenChains: brokenChains.length,
        },
      };

      if (result.circular.length > 0) {
        const cycles = findCircularTypeDependencies(graph, result.circular);
        output.cycles = cycles.map((c) => c.cycle);
      }

      console.log(JSON.stringify(output, null, 2));
    } else {
      printTypesOrder(result, graph);
    }
  }

  // Exit with error if there are broken chains or circular deps
  const hasIssues = brokenChains.length > 0 || result.circular.length > 0;

  process.exit(hasIssues ? 1 : 0);
}

main();
