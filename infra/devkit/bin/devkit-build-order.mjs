#!/usr/bin/env node

/**
 * @kb-labs/devkit - Build Order Calculator
 *
 * Calculates the correct build order for all packages based on dependencies.
 * Uses topological sort to determine which packages need to be built first.
 *
 * Usage:
 *   kb-devkit-build-order                 # Show build order
 *   kb-devkit-build-order --layers        # Show parallel build layers
 *   kb-devkit-build-order --package=cli   # Build order for specific package
 *   kb-devkit-build-order --json          # Output JSON
 *   kb-devkit-build-order --script        # Generate build script
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  script: args.includes('--script'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  package: args.find((arg) => arg.startsWith('--package='))?.split('=')[1],
};

// Shared package discovery — supports both flat and categorized layouts
import { findPackages } from './lib/find-packages.mjs';

/**
 * Build dependency graph
 */
function buildDependencyGraph(packages) {
  const graph = new Map(); // packageName -> { deps: Set, path: string }
  const nameToPath = new Map();

  // First pass: collect all package names
  for (const packagePath of packages) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName || !packageName.startsWith('@kb-labs/')) {continue;}

    graph.set(packageName, {
      deps: new Set(),
      path: packagePath,
      dir: path.dirname(packagePath),
    });

    nameToPath.set(packageName, packagePath);
  }

  // Second pass: build dependency edges
  for (const packagePath of packages) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName || !packageName.startsWith('@kb-labs/')) {continue;}

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const [dep, version] of Object.entries(allDeps)) {
      // Skip external dependencies
      if (!dep.startsWith('@kb-labs/')) {continue;}

      // Track ALL workspace dependencies regardless of protocol
      // Supports: workspace:*, workspace:^1.0.0, link:../path, *
      const isWorkspaceDep =
        version.startsWith('workspace:') ||
        version.startsWith('link:') ||
        version === '*';

      if (isWorkspaceDep && graph.has(dep)) {
        graph.get(packageName).deps.add(dep);
      }
    }
  }

  return graph;
}

/**
 * Topological sort using Kahn's algorithm
 * Returns layers of packages that can be built in parallel
 */
function topologicalSort(graph) {
  // Calculate in-degree (number of dependencies) for each package
  const inDegree = new Map();
  const reverseDeps = new Map(); // who depends on me

  for (const [pkg, { deps }] of graph.entries()) {
    if (!inDegree.has(pkg)) {
      inDegree.set(pkg, 0);
    }
    if (!reverseDeps.has(pkg)) {
      reverseDeps.set(pkg, new Set());
    }

    for (const dep of deps) {
      inDegree.set(pkg, (inDegree.get(pkg) || 0) + 1);

      if (!reverseDeps.has(dep)) {
        reverseDeps.set(dep, new Set());
      }
      reverseDeps.get(dep).add(pkg);
    }
  }

  // Find packages with no dependencies (can be built first)
  const queue = [];
  for (const [pkg, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(pkg);
    }
  }

  const layers = [];
  const sorted = [];

  while (queue.length > 0) {
    // All packages in queue can be built in parallel (same layer)
    const layer = [...queue];
    layers.push(layer);
    sorted.push(...layer);

    queue.length = 0;

    // Process all packages in current layer
    for (const pkg of layer) {
      // For each package that depends on this one
      for (const dependent of reverseDeps.get(pkg) || []) {
        inDegree.set(dependent, inDegree.get(dependent) - 1);

        // If all dependencies are satisfied, add to queue
        if (inDegree.get(dependent) === 0) {
          queue.push(dependent);
        }
      }
    }
  }

  // Check for circular dependencies
  if (sorted.length !== graph.size) {
    const missing = Array.from(graph.keys()).filter((pkg) => !sorted.includes(pkg));
    return { layers, sorted, circular: missing };
  }

  return { layers, sorted, circular: [] };
}

/**
 * Find circular dependency cycles using DFS
 */
function findCircularDependencies(graph, circularPackages) {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();
  const path = [];

  function dfs(pkg) {
    if (recursionStack.has(pkg)) {
      // Found a cycle - extract it from path
      const cycleStart = path.indexOf(pkg);
      const cycle = [...path.slice(cycleStart), pkg];

      // Check if this cycle is new (not a rotation of existing cycle)
      const cycleKey = cycle.slice(0, -1).sort().join('→');
      if (!cycles.some(c => c.key === cycleKey)) {
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
      for (const dep of node.deps) {
        // Only follow dependencies that are in circular packages
        if (circularPackages.includes(dep)) {
          dfs(dep);
        }
      }
    }

    path.pop();
    recursionStack.delete(pkg);
  }

  // Start DFS from each circular package
  for (const pkg of circularPackages) {
    if (!visited.has(pkg)) {
      dfs(pkg);
    }
  }

  return cycles;
}

/**
 * Get build order for specific package and its dependencies
 */
function getBuildOrderForPackage(graph, packageName) {
  const visited = new Set();
  const order = [];

  function visit(pkg) {
    if (visited.has(pkg)) {return;}
    visited.add(pkg);

    const node = graph.get(pkg);
    if (!node) {return;}

    // Visit dependencies first
    for (const dep of node.deps) {
      visit(dep);
    }

    order.push(pkg);
  }

  visit(packageName);
  return order;
}

/**
 * Print build order
 */
function printBuildOrder(result, graph) {
  log('\n🔨 KB Labs Build Order\n', 'bold');

  if (result.circular.length > 0) {
    log('❌ Circular dependencies detected!\n', 'red');

    // Find actual cycles
    const cycles = findCircularDependencies(graph, result.circular);

    if (cycles.length > 0) {
      log(`Found ${cycles.length} circular dependency cycle(s):\n`, 'yellow');

      for (let i = 0; i < cycles.length; i++) {
        const { cycle } = cycles[i];
        log(`${i + 1}. ${cycle.join(' → ')}`, 'red');
        log('', 'reset');
      }
    } else {
      log('The following packages are involved in circular dependencies:', 'yellow');
      for (const pkg of result.circular) {
        log(`   ${pkg}`, 'red');
      }
    }

    log('\nCannot determine build order. Fix circular dependencies first.', 'gray');
    log('💡 To fix: Break the cycle by extracting shared code into a separate package\n', 'cyan');
    return;
  }

  log(`Found ${result.sorted.length} packages\n`, 'gray');

  if (options.layers) {
    // Show parallel build layers
    log('📦 Build Layers (packages in same layer can build in parallel):\n', 'blue');

    for (let i = 0; i < result.layers.length; i++) {
      const layer = result.layers[i];
      log(`Layer ${i + 1} (${layer.length} packages):`, 'cyan');

      for (const pkg of layer) {
        const deps = graph.get(pkg).deps;
        log(`   ${pkg}`, 'gray');
        if (options.verbose && deps.size > 0) {
          log(`      depends on: ${Array.from(deps).join(', ')}`, 'gray');
        }
      }
      log('', 'reset');
    }

    log(`Total layers: ${result.layers.length}`, 'blue');
    log(`Max parallelism: ${Math.max(...result.layers.map((l) => l.length))} packages\n`, 'blue');
  } else {
    // Show sequential build order
    log('📦 Build Order (sequential):\n', 'blue');

    for (let i = 0; i < result.sorted.length; i++) {
      const pkg = result.sorted[i];
      const deps = graph.get(pkg).deps;

      log(`${(i + 1).toString().padStart(3)}. ${pkg}`, 'cyan');

      if (options.verbose && deps.size > 0) {
        log(`      depends on: ${Array.from(deps).join(', ')}`, 'gray');
      }
    }
    log('', 'reset');
  }

  // Tips
  log('💡 Tips:', 'blue');
  log('   • Use --layers to see parallel build opportunities', 'gray');
  log('   • Use --package=name to see build order for specific package', 'gray');
  log('   • Use --script to generate a build script', 'gray');
  log('   • Use pnpm --filter to build specific packages', 'gray');
  log('', 'reset');
}

/**
 * Generate build script
 */
function generateBuildScript(result, graph) {
  const lines = [
    '#!/bin/bash',
    '',
    '# Auto-generated build script',
    '# Generated by kb-devkit-build-order',
    '',
    'set -e  # Exit on error',
    '',
  ];

  if (options.layers) {
    // Parallel build script
    lines.push('# Build in layers (parallel within each layer)');
    lines.push('');

    for (let i = 0; i < result.layers.length; i++) {
      const layer = result.layers[i];
      lines.push(`echo "Building layer ${i + 1}/${result.layers.length} (${layer.length} packages)..."`);

      if (layer.length === 1) {
        // Single package, build sequentially
        const pkg = layer[0];
        lines.push(`pnpm --filter ${pkg} run build`);
      } else {
        // Multiple packages, build in parallel
        const filters = layer.map((pkg) => `--filter ${pkg}`).join(' ');
        lines.push(`pnpm ${filters} run build --parallel`);
      }

      lines.push('');
    }

    lines.push('echo "All packages built successfully!"');
  } else {
    // Sequential build script
    lines.push('# Build in order (sequential)');
    lines.push('');

    for (let i = 0; i < result.sorted.length; i++) {
      const pkg = result.sorted[i];
      lines.push(`echo "Building ${i + 1}/${result.sorted.length}: ${pkg}..."`);
      lines.push(`pnpm --filter ${pkg} run build`);
    }

    lines.push('');
    lines.push('echo "All packages built successfully!"');
  }

  return lines.join('\n');
}

/**
 * Main function
 */
function main() {
  const rootDir = process.cwd();

  if (!options.json) {
    log('\n🚀 KB Labs Build Order Calculator\n', 'bold');
  }

  const packages = findPackages(rootDir);

  if (packages.length === 0) {
    log('⚠️  No KB Labs packages found', 'yellow');
    process.exit(0);
  }

  const graph = buildDependencyGraph(packages);

  if (options.package) {
    // Build order for specific package
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

    const order = getBuildOrderForPackage(graph, fullPackageName);

    if (options.json) {
      console.log(JSON.stringify({ package: fullPackageName, order }, null, 2));
    } else {
      log(`\n📦 Build order for ${fullPackageName}:\n`, 'blue');
      for (let i = 0; i < order.length; i++) {
        const pkg = order[i];
        const isCurrent = pkg === fullPackageName;
        log(`${(i + 1).toString().padStart(3)}. ${pkg}${isCurrent ? ' ⬅ target' : ''}`, isCurrent ? 'yellow' : 'gray');
      }
      log('', 'reset');
    }
  } else {
    // Full build order
    const result = topologicalSort(graph);

    if (options.json) {
      const output = {
        total: graph.size,
        layers: result.layers,
        sorted: result.sorted,
        circular: result.circular,
      };

      // Add cycle details if circular dependencies exist
      if (result.circular.length > 0) {
        const cycles = findCircularDependencies(graph, result.circular);
        output.cycles = cycles.map(c => c.cycle);
      }

      console.log(JSON.stringify(output, null, 2));
    } else if (options.script) {
      const script = generateBuildScript(result, graph);
      console.log(script);
    } else {
      printBuildOrder(result, graph);
    }
  }

  process.exit(0);
}

main();
