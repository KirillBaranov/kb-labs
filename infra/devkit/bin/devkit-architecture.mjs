#!/usr/bin/env node

/**
 * @kb-labs/devkit - Architecture Audit Tool (Tier 1+)
 *
 * Analyzes monorepo architecture and generates:
 * 1. AI-first JSON output (complete structured data for LLM consumption)
 * 2. Human-first visual graph (interactive HTML with Cytoscape.js)
 * 3. Human-first markdown report (executive summary with recommendations)
 *
 * Features:
 * - Automated anomaly detection (10 types):
 *   • Circular dependencies (score: 100)
 *   • Layer violations (score: 90) - infrastructure depends on plugin/feature
 *   • God packages (score: 80) - >15 dependents
 *   • Unstable core (score: 75) - core/infra with instability >0.7
 *   • Bidirectional dependencies (score: 70) - A→B && B→A (not circular)
 *   • Code smell: Large packages (score: 60) - >10K LOC
 *   • Orphan packages (score: 60) - 0 dependents
 *   • Code smell: Many dependencies (score: 50) - >10 deps
 *   • Deep chains (score: 50) - depth >7
 *   • Code smell: No docs (score: 40) - missing README
 * - Heuristic scoring (prioritize top 10 issues by impact)
 * - Metrics calculation (coupling, instability, centrality, depth)
 * - Layer inference (Infrastructure → Core → Plugin → Feature → UI)
 * - Trend analysis (compare with previous runs, track improvements)
 * - Dual output (AI-readable JSON + Human-readable graph/report)
 *
 * Usage:
 *   kb-devkit-architecture                    # Generate all outputs + trends
 *   kb-devkit-architecture --ai               # Generate only JSON (stdout)
 *   kb-devkit-architecture --human            # Generate only graph + report
 *   kb-devkit-architecture --format=json      # JSON to stdout
 *   kb-devkit-architecture --format=md        # Markdown report
 *   kb-devkit-architecture --format=html      # HTML graph (TODO)
 *   kb-devkit-architecture --open             # Open graph in browser (TODO)
 *   kb-devkit-architecture --layer=core       # Filter by layer
 *   kb-devkit-architecture --threshold=70     # Show anomalies >= 70 score
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
  if (!options.json && options.format !== 'json') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  ai: args.includes('--ai'),
  human: args.includes('--human'),
  open: args.includes('--open'),
  layer: args.find((arg) => arg.startsWith('--layer='))?.split('=')[1],
  threshold: parseInt(args.find((arg) => arg.startsWith('--threshold='))?.split('=')[1] || '0'),
  format: args.find((arg) => arg.startsWith('--format='))?.split('=')[1] || 'all',
  json: args.includes('--json'),
};

// ============================
// Phase 1: Data Collection
// ============================

/**
 * Extract repo name from a package.json path.
 * Handles both flat (kb-labs-core/packages/...) and categorized (platform/kb-labs-core/packages/...) layouts.
 */
function extractRepoFromPath(pkgPath) {
  const parts = pkgPath.split(path.sep);
  const repo = parts.find((p) => p.startsWith('kb-labs-'));
  return repo || 'unknown';
}

/**
 * Calculate package size (LOC, file count)
 */
function calculatePackageSize(packageDir) {
  const srcDir = path.join(packageDir, 'src');

  if (!fs.existsSync(srcDir)) {
    return { fileCount: 0, linesOfCode: 0 };
  }

  let fileCount = 0;
  let linesOfCode = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        fileCount++;
        const content = fs.readFileSync(fullPath, 'utf-8');
        linesOfCode += content.split('\n').length;
      }
    }
  }

  walk(srcDir);

  return { fileCount, linesOfCode };
}

/**
 * Infer layer from package name
 */
function inferLayer(packageName) {
  if (!packageName) {return 'unknown';}

  // Extract meaningful part after @kb-labs/
  const name = packageName.replace('@kb-labs/', '');

  // Infrastructure layer
  if (name.startsWith('core-') || name.startsWith('shared-')) {
    return 'infrastructure';
  }

  // Core/Platform layer
  if (name.startsWith('plugin-') || name.startsWith('cli-') || name.startsWith('workflow-')) {
    return 'core';
  }

  // AI/Intelligence layer (plugins)
  if (name.startsWith('mind-') || name.startsWith('knowledge-') || name.startsWith('analytics-')) {
    return 'plugin';
  }

  // Feature layer
  if (name.startsWith('ai-') || name.startsWith('audit-') || name.startsWith('devlink-')) {
    return 'feature';
  }

  // UI layer
  if (name.startsWith('studio-') || name.startsWith('rest-api-')) {
    return 'ui';
  }

  return 'unknown';
}

/**
 * Build dependency graph
 */
function buildDependencyGraph(packages) {
  const graph = new Map(); // package -> {dependencies, dependents, metadata}
  const packageData = new Map(); // package -> full data

  // First pass: collect all packages
  for (const pkg of packages) {
    const packageJson = JSON.parse(fs.readFileSync(pkg.path, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName || !packageName.startsWith('@kb-labs/')) {continue;}

    const size = calculatePackageSize(pkg.dir);
    const layer = inferLayer(packageName);

    const metadata = {
      name: packageName,
      version: packageJson.version || '0.0.0',
      description: packageJson.description || '',
      path: pkg.dir,
      repository: pkg.repository,
      layer,
      size,
    };

    graph.set(packageName, {
      dependencies: [],
      dependents: [],
      metadata,
    });

    packageData.set(packageName, { packageJson, metadata });
  }

  // Second pass: build dependency relationships
  for (const [packageName, data] of packageData.entries()) {
    const allDeps = {
      ...data.packageJson.dependencies,
      ...data.packageJson.devDependencies,
    };

    for (const dep of Object.keys(allDeps)) {
      if (dep.startsWith('@kb-labs/') && graph.has(dep)) {
        graph.get(packageName).dependencies.push(dep);
        graph.get(dep).dependents.push(packageName);
      }
    }
  }

  return { graph, packageData };
}

// ============================
// Phase 2: Metrics Calculation
// ============================

/**
 * Calculate coupling metrics for each package
 */
function calculateMetrics(graph) {
  const metrics = new Map();

  for (const [packageName, data] of graph.entries()) {
    const afferentCoupling = data.dependents.length; // incoming dependencies (Ca)
    const efferentCoupling = data.dependencies.length; // outgoing dependencies (Ce)

    // Instability: I = Ce / (Ce + Ca), where 0 = stable, 1 = unstable
    const totalCoupling = efferentCoupling + afferentCoupling;
    const instability = totalCoupling === 0 ? 0 : efferentCoupling / totalCoupling;

    // Centrality: how important is this package (simple version: number of dependents)
    const centrality = afferentCoupling / Math.max(1, graph.size);

    // Depth: distance from root (packages with no dependencies)
    const depth = calculateDepth(packageName, graph, new Set());

    metrics.set(packageName, {
      afferentCoupling,
      efferentCoupling,
      instability,
      centrality,
      depth,
    });
  }

  return metrics;
}

/**
 * Calculate depth of package in dependency tree
 */
function calculateDepth(packageName, graph, visited) {
  if (visited.has(packageName)) {return 0;} // circular dependency
  visited.add(packageName);

  const deps = graph.get(packageName).dependencies;
  if (deps.length === 0) {return 0;}

  let maxDepth = 0;
  for (const dep of deps) {
    const depthOfDep = calculateDepth(dep, graph, new Set(visited));
    maxDepth = Math.max(maxDepth, depthOfDep + 1);
  }

  return maxDepth;
}

// ============================
// Phase 3: Anomaly Detection
// ============================

/**
 * Detect circular dependencies using DFS
 */
function detectCircularDependencies(graph) {
  const cycles = [];
  const visited = new Set();
  const recStack = new Set();
  const path = [];

  function dfs(node) {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const deps = graph.get(node).dependencies;

    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (dfs(dep)) {return true;}
      } else if (recStack.has(dep)) {
        // Found a cycle
        const cycleStart = path.indexOf(dep);
        const cycle = path.slice(cycleStart).concat([dep]);
        cycles.push(cycle);
        return true;
      }
    }

    recStack.delete(node);
    path.pop();
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  // Deduplicate cycles
  const uniqueCycles = [];
  const seen = new Set();

  for (const cycle of cycles) {
    const normalized = cycle.slice(0, -1).sort().join('→');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueCycles.push(cycle);
    }
  }

  return uniqueCycles;
}

/**
 * Detect architectural anomalies
 */
function detectAnomalies(graph, metrics) {
  const anomalies = [];
  let anomalyId = 0;

  // 1. Circular dependencies (score: 100)
  const cycles = detectCircularDependencies(graph);
  for (const cycle of cycles) {
    anomalies.push({
      id: `cycle-${++anomalyId}`,
      type: 'circular-dependency',
      severity: 'critical',
      score: 100,
      packages: cycle.slice(0, -1), // remove duplicate last element
      cycle,
      impact: 'Blocks build order calculation',
      affectedPackages: cycle.length - 1,
      recommendation: `Extract shared types/interfaces to a new contracts package`,
      estimatedEffort: '2-4 hours',
    });
  }

  // 2. God packages (score: 80, threshold: >15 dependents)
  for (const [packageName, data] of graph.entries()) {
    const Ca = metrics.get(packageName).afferentCoupling;
    if (Ca > 15) {
      anomalies.push({
        id: `god-${++anomalyId}`,
        type: 'god-package',
        severity: 'high',
        score: 80,
        package: packageName,
        dependents: Ca,
        impact: `Changes ripple through ${Ca} packages (${((Ca / graph.size) * 100).toFixed(1)}% of codebase)`,
        recommendation: `Split into smaller packages (e.g., ${packageName.split('/')[1]}-types, ${packageName.split('/')[1]}-impl)`,
        estimatedEffort: '4-8 hours',
      });
    }
  }

  // 3. Orphan packages (score: 60, threshold: 0 dependents, not CLI/plugin)
  for (const [packageName, data] of graph.entries()) {
    const Ca = metrics.get(packageName).afferentCoupling;
    const name = packageName.replace('@kb-labs/', '');

    // Skip expected orphans (CLI entry points, plugins)
    const isExpectedOrphan =
      name.endsWith('-cli') ||
      name.endsWith('-plugin') ||
      name.endsWith('-bin') ||
      name.startsWith('rest-api-') ||
      name.startsWith('studio-') ||
      name.startsWith('playbooks-');

    if (Ca === 0 && !isExpectedOrphan) {
      anomalies.push({
        id: `orphan-${++anomalyId}`,
        type: 'orphan-package',
        severity: 'medium',
        score: 60,
        package: packageName,
        impact: 'No other package depends on this (potential dead code)',
        recommendation: 'Review if package is still needed or should be removed',
        estimatedEffort: '1-2 hours',
      });
    }
  }

  // 4. Unstable core packages (score: 75, threshold: layer=infrastructure && I>0.7)
  for (const [packageName, data] of graph.entries()) {
    const layer = data.metadata.layer;
    const I = metrics.get(packageName).instability;

    if ((layer === 'infrastructure' || layer === 'core') && I > 0.7) {
      anomalies.push({
        id: `unstable-${++anomalyId}`,
        type: 'unstable-core',
        severity: 'high',
        score: 75,
        package: packageName,
        instability: I.toFixed(2),
        impact: 'Core package is unstable (high efferent coupling)',
        recommendation: 'Reduce dependencies or extract to separate package',
        estimatedEffort: '2-4 hours',
      });
    }
  }

  // 5. Deep dependency chains (score: 50, threshold: depth > 7)
  for (const [packageName, data] of graph.entries()) {
    const depth = metrics.get(packageName).depth;

    if (depth > 7) {
      anomalies.push({
        id: `deep-${++anomalyId}`,
        type: 'deep-chain',
        severity: 'medium',
        score: 50,
        package: packageName,
        depth,
        impact: 'Deep dependency chain increases fragility',
        recommendation: 'Flatten dependency tree or introduce intermediate layers',
        estimatedEffort: '4-6 hours',
      });
    }
  }

  // 6. Layer violations (score: 90, threshold: lower layer depends on higher layer)
  const layerHierarchy = { infrastructure: 0, core: 1, plugin: 2, feature: 3, ui: 4, unknown: 5 };
  for (const [packageName, data] of graph.entries()) {
    const packageLayer = data.metadata.layer;
    const packageLayerLevel = layerHierarchy[packageLayer];

    for (const dep of data.dependencies) {
      const depLayer = graph.get(dep)?.metadata.layer;
      if (!depLayer) {continue;}

      const depLayerLevel = layerHierarchy[depLayer];

      // Violation: lower layer depends on higher layer (e.g., infrastructure → plugin)
      if (packageLayerLevel < depLayerLevel) {
        anomalies.push({
          id: `layer-violation-${++anomalyId}`,
          type: 'layer-violation',
          severity: 'critical',
          score: 90,
          package: packageName,
          dependency: dep,
          fromLayer: packageLayer,
          toLayer: depLayer,
          impact: `${packageLayer} layer depends on ${depLayer} layer (inverted hierarchy)`,
          recommendation: `Move ${dep} to ${packageLayer} layer or refactor dependency`,
          estimatedEffort: '3-6 hours',
        });
      }
    }
  }

  // 7. Bidirectional dependencies (score: 70, threshold: A→B && B→A but not circular)
  const bidirectional = new Set();
  for (const [packageA, dataA] of graph.entries()) {
    for (const packageB of dataA.dependencies) {
      const dataB = graph.get(packageB);
      if (!dataB) {continue;}

      // Check if B also depends on A
      if (dataB.dependencies.includes(packageA)) {
        const pair = [packageA, packageB].sort().join('↔');
        if (!bidirectional.has(pair)) {
          bidirectional.add(pair);

          // Verify it's not already detected as circular
          const isCycle = cycles.some((cycle) => cycle.includes(packageA) && cycle.includes(packageB));

          if (!isCycle) {
            anomalies.push({
              id: `bidirectional-${++anomalyId}`,
              type: 'bidirectional-dependency',
              severity: 'high',
              score: 70,
              packages: [packageA, packageB],
              impact: 'Bidirectional coupling increases complexity and fragility',
              recommendation: 'Extract shared types to a contracts package or invert one dependency',
              estimatedEffort: '2-3 hours',
            });
          }
        }
      }
    }
  }

  // 8. Code smells: Large packages (score: 60, threshold: >10K LOC)
  for (const [packageName, data] of graph.entries()) {
    const loc = data.metadata.size.linesOfCode;

    if (loc > 10000) {
      anomalies.push({
        id: `large-package-${++anomalyId}`,
        type: 'code-smell-large-package',
        severity: 'medium',
        score: 60,
        package: packageName,
        linesOfCode: loc,
        impact: `Package is very large (${loc.toLocaleString()} LOC), hard to maintain`,
        recommendation: 'Split into smaller, focused packages by feature or domain',
        estimatedEffort: '8-12 hours',
      });
    }
  }

  // 9. Code smells: Too many dependencies (score: 50, threshold: >10 deps)
  for (const [packageName, data] of graph.entries()) {
    const depsCount = data.dependencies.length;

    if (depsCount > 10) {
      anomalies.push({
        id: `many-deps-${++anomalyId}`,
        type: 'code-smell-many-dependencies',
        severity: 'medium',
        score: 50,
        package: packageName,
        dependenciesCount: depsCount,
        impact: `Package has ${depsCount} dependencies, high coupling`,
        recommendation: 'Review and reduce dependencies, consider dependency injection',
        estimatedEffort: '4-6 hours',
      });
    }
  }

  // 10. Code smells: No documentation (score: 40, threshold: missing README)
  for (const [packageName, data] of graph.entries()) {
    const packageDir = path.dirname(data.metadata.path);
    const readmePath = path.join(packageDir, 'README.md');

    if (!fs.existsSync(readmePath)) {
      anomalies.push({
        id: `no-docs-${++anomalyId}`,
        type: 'code-smell-no-docs',
        severity: 'low',
        score: 40,
        package: packageName,
        impact: 'Package has no README, difficult for new developers',
        recommendation: 'Create README.md with overview, usage, and examples',
        estimatedEffort: '1-2 hours',
      });
    }
  }

  // Sort by score (descending)
  anomalies.sort((a, b) => b.score - a.score);

  return anomalies;
}

/**
 * Load historical architecture data for trend analysis
 */
function loadHistoricalData(archDir) {
  if (!fs.existsSync(archDir)) {
    return [];
  }

  const files = fs.readdirSync(archDir).filter((f) => f.startsWith('architecture-') && f.endsWith('.json'));

  const history = [];

  for (const file of files.slice(-5)) {
    // Load last 5 runs
    try {
      const data = JSON.parse(fs.readFileSync(path.join(archDir, file), 'utf-8'));
      history.push({
        date: data.metadata.generatedAt,
        healthScore: data.metadata.healthScore,
        totalPackages: data.metadata.totalPackages,
        anomaliesCount: data.anomalies.length,
        anomaliesBySeverity: {
          critical: data.anomalies.filter((a) => a.severity === 'critical').length,
          high: data.anomalies.filter((a) => a.severity === 'high').length,
          medium: data.anomalies.filter((a) => a.severity === 'medium').length,
          low: data.anomalies.filter((a) => a.severity === 'low').length,
        },
        anomaliesByType: data.anomalies.reduce((acc, a) => {
          acc[a.type] = (acc[a.type] || 0) + 1;
          return acc;
        }, {}),
      });
    } catch (err) {
      // Skip corrupted files
    }
  }

  return history.sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Generate trend analysis comparing current run with historical data
 */
function generateTrendAnalysis(currentData, history) {
  if (history.length === 0) {
    return null;
  }

  const previous = history[history.length - 1];
  const trends = {};

  // Health score trend
  const healthDelta = currentData.metadata.healthScore - previous.healthScore;
  trends.healthScore = {
    current: currentData.metadata.healthScore,
    previous: previous.healthScore,
    delta: healthDelta,
    direction: healthDelta > 0 ? '📈' : healthDelta < 0 ? '📉' : '➡️',
    status: healthDelta > 5 ? '✅' : healthDelta < -5 ? '❌' : '⚠️',
  };

  // Anomalies count trend
  const anomaliesDelta = currentData.anomalies.length - previous.anomaliesCount;
  trends.anomaliesCount = {
    current: currentData.anomalies.length,
    previous: previous.anomaliesCount,
    delta: anomaliesDelta,
    direction: anomaliesDelta < 0 ? '📉' : anomaliesDelta > 0 ? '📈' : '➡️',
    status: anomaliesDelta < 0 ? '✅' : anomaliesDelta > 0 ? '❌' : '⚠️',
  };

  // Anomalies by severity trends
  const currentBySeverity = {
    critical: currentData.anomalies.filter((a) => a.severity === 'critical').length,
    high: currentData.anomalies.filter((a) => a.severity === 'high').length,
    medium: currentData.anomalies.filter((a) => a.severity === 'medium').length,
    low: currentData.anomalies.filter((a) => a.severity === 'low').length,
  };

  trends.bySeverity = {};
  for (const [severity, count] of Object.entries(currentBySeverity)) {
    const prevCount = previous.anomaliesBySeverity[severity] || 0;
    const delta = count - prevCount;
    trends.bySeverity[severity] = {
      current: count,
      previous: prevCount,
      delta,
      direction: delta < 0 ? '📉' : delta > 0 ? '📈' : '➡️',
      status: delta <= 0 ? '✅' : '❌',
    };
  }

  // Anomalies by type trends
  const currentByType = currentData.anomalies.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  trends.byType = {};
  const allTypes = new Set([...Object.keys(currentByType), ...Object.keys(previous.anomaliesByType || {})]);

  for (const type of allTypes) {
    const current = currentByType[type] || 0;
    const prev = (previous.anomaliesByType || {})[type] || 0;
    const delta = current - prev;

    if (delta !== 0) {
      // Only track changed types
      trends.byType[type] = {
        current,
        previous: prev,
        delta,
        direction: delta < 0 ? '📉' : '📈',
        status: delta < 0 ? '✅' : '❌',
      };
    }
  }

  // Historical comparison (last 30 days if available)
  if (history.length > 1) {
    const oldestDate = new Date(history[0].date);
    const newestDate = new Date(currentData.metadata.generatedAt);
    const daysDiff = Math.round((newestDate - oldestDate) / (1000 * 60 * 60 * 24));

    trends.historical = {
      period: `${daysDiff} days`,
      healthScoreTrend: currentData.metadata.healthScore - history[0].healthScore,
      anomaliesTrend: currentData.anomalies.length - history[0].anomaliesCount,
    };
  }

  return trends;
}

// ============================
// Phase 4: Output Generation
// ============================

/**
 * Generate AI-first JSON output
 */
function generateJSON(graph, metrics, anomalies, options) {
  const packages = [];
  const layers = {};
  const nodes = [];
  const edges = [];

  // Build packages array
  for (const [packageName, data] of graph.entries()) {
    const pkgMetrics = metrics.get(packageName);
    const pkgAnomalies = anomalies.filter(
      (a) => a.package === packageName || a.packages?.includes(packageName)
    );

    packages.push({
      name: packageName,
      path: data.metadata.path,
      repository: data.metadata.repository,
      layer: data.metadata.layer,
      description: data.metadata.description,
      version: data.metadata.version,
      metrics: {
        linesOfCode: data.metadata.size.linesOfCode,
        fileCount: data.metadata.size.fileCount,
        afferentCoupling: pkgMetrics.afferentCoupling,
        efferentCoupling: pkgMetrics.efferentCoupling,
        instability: parseFloat(pkgMetrics.instability.toFixed(3)),
        centrality: parseFloat(pkgMetrics.centrality.toFixed(3)),
        depth: pkgMetrics.depth,
      },
      dependencies: data.dependencies,
      dependents: data.dependents,
      anomalies: pkgAnomalies.map((a) => ({
        type: a.type,
        severity: a.severity,
        score: a.score,
        message: a.impact,
        recommendation: a.recommendation,
      })),
    });

    // Build graph nodes
    nodes.push({
      id: packageName,
      layer: data.metadata.layer,
      metrics: {
        centrality: parseFloat(pkgMetrics.centrality.toFixed(3)),
        instability: parseFloat(pkgMetrics.instability.toFixed(3)),
      },
    });

    // Build graph edges
    for (const dep of data.dependencies) {
      edges.push({
        from: packageName,
        to: dep,
        type: 'dependency',
      });
    }

    // Group by layer
    const layer = data.metadata.layer;
    if (!layers[layer]) {
      layers[layer] = {
        packages: [],
        count: 0,
        metrics: {
          averageInstability: 0,
          averageCoupling: 0,
          totalLOC: 0,
        },
        issues: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        },
      };
    }

    layers[layer].packages.push(packageName);
    layers[layer].count++;
    layers[layer].metrics.totalLOC += data.metadata.size.linesOfCode;
  }

  // Calculate layer metrics
  for (const [layerName, layerData] of Object.entries(layers)) {
    const layerPackages = layerData.packages;
    const instabilities = layerPackages.map((p) => metrics.get(p).instability);
    const couplings = layerPackages.map(
      (p) => metrics.get(p).afferentCoupling + metrics.get(p).efferentCoupling
    );

    layerData.metrics.averageInstability = parseFloat(
      (instabilities.reduce((a, b) => a + b, 0) / layerPackages.length).toFixed(2)
    );
    layerData.metrics.averageCoupling = parseFloat(
      (couplings.reduce((a, b) => a + b, 0) / layerPackages.length).toFixed(1)
    );

    // Count issues by severity
    for (const pkg of layerPackages) {
      const pkgAnomalies = anomalies.filter(
        (a) => a.package === pkg || a.packages?.includes(pkg)
      );
      for (const anomaly of pkgAnomalies) {
        layerData.issues[anomaly.severity]++;
      }
    }
  }

  // Find longest dependency chain
  let longestChain = { depth: 0, path: [] };
  for (const [packageName, pkgMetrics] of metrics.entries()) {
    if (pkgMetrics.depth > longestChain.depth) {
      // Reconstruct path (simplified - just show depth)
      longestChain = {
        depth: pkgMetrics.depth,
        path: [packageName], // TODO: reconstruct full path
      };
    }
  }

  // Calculate health score
  const totalPackages = graph.size;
  let healthScore = 100;

  // Deductions
  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
  const highCount = anomalies.filter((a) => a.severity === 'high').length;
  const mediumCount = anomalies.filter((a) => a.severity === 'medium').length;

  healthScore -= criticalCount * 20;
  healthScore -= highCount * 10;
  healthScore -= mediumCount * 5;

  healthScore = Math.max(0, Math.min(100, healthScore));

  const healthGrade =
    healthScore >= 90 ? 'A' : healthScore >= 80 ? 'B' : healthScore >= 70 ? 'C' : healthScore >= 60 ? 'D' : 'F';

  // Build final JSON
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
      totalPackages,
      totalRepositories: new Set(packages.map((p) => p.repository)).size,
      healthScore,
      healthGrade,
    },
    packages,
    layers,
    anomalies,
    graph: {
      nodes,
      edges,
    },
    chains: {
      longest: longestChain,
    },
    recommendations: generateRecommendations(anomalies),
  };
}

/**
 * Generate prioritized recommendations
 */
function generateRecommendations(anomalies) {
  const recommendations = [];

  const critical = anomalies.filter((a) => a.severity === 'critical');
  const high = anomalies.filter((a) => a.severity === 'high');
  const medium = anomalies.filter((a) => a.severity === 'medium');

  if (critical.length > 0) {
    recommendations.push({
      priority: 'immediate',
      timeframe: 'Week 1',
      tasks: critical.slice(0, 3).map((a, i) => ({
        id: `rec-${i + 1}`,
        title: a.type.replace(/-/g, ' '),
        description: a.recommendation,
        effort: a.estimatedEffort,
        impact: a.impact,
        relatedAnomalies: [a.id],
      })),
    });
  }

  if (high.length > 0) {
    recommendations.push({
      priority: 'high',
      timeframe: 'Month 1',
      tasks: high.slice(0, 5).map((a, i) => ({
        id: `rec-${critical.length + i + 1}`,
        title: a.type.replace(/-/g, ' '),
        description: a.recommendation,
        effort: a.estimatedEffort,
        impact: a.impact,
        relatedAnomalies: [a.id],
      })),
    });
  }

  if (medium.length > 0) {
    recommendations.push({
      priority: 'medium',
      timeframe: 'Quarter',
      tasks: medium.slice(0, 5).map((a, i) => ({
        id: `rec-${critical.length + high.length + i + 1}`,
        title: a.type.replace(/-/g, ' '),
        description: a.recommendation,
        effort: a.estimatedEffort,
        impact: a.impact,
        relatedAnomalies: [a.id],
      })),
    });
  }

  return recommendations;
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(jsonData) {
  const { metadata, anomalies, layers, chains, recommendations } = jsonData;

  let report = `# KB Labs Architecture Audit Report\n\n`;
  report += `**Date:** ${new Date(metadata.generatedAt).toLocaleDateString()}\n\n`;

  // Executive Summary
  report += `## 🎯 Executive Summary\n\n`;
  report += `- **Total packages:** ${metadata.totalPackages}\n`;
  report += `- **Total repositories:** ${metadata.totalRepositories}\n`;
  report += `- **Health score:** ${metadata.healthScore}/100 (Grade ${metadata.healthGrade})\n`;
  report += `- **Critical issues:** ${anomalies.filter((a) => a.severity === 'critical').length}\n`;
  report += `- **High priority issues:** ${anomalies.filter((a) => a.severity === 'high').length}\n`;
  report += `- **Medium priority issues:** ${anomalies.filter((a) => a.severity === 'medium').length}\n\n`;

  // Top 10 Anomalies
  const top10 = anomalies.slice(0, 10);
  if (top10.length > 0) {
    report += `## 🚨 Top 10 Anomalies (Require Architect Attention)\n\n`;

    for (let i = 0; i < top10.length; i++) {
      const anomaly = top10[i];
      const emoji = anomaly.severity === 'critical' ? '🔴' : anomaly.severity === 'high' ? '🟠' : '🟡';

      report += `### ${i + 1}. ${emoji} ${anomaly.type.replace(/-/g, ' ')}\n`;
      report += `**Severity:** ${anomaly.severity} (Score: ${anomaly.score})\n`;
      report += `**Impact:** ${anomaly.impact}\n`;
      report += `**Recommendation:** ${anomaly.recommendation}\n`;
      report += `**Estimated Effort:** ${anomaly.estimatedEffort}\n\n`;
    }
  }

  // Trend Analysis
  if (jsonData.trends) {
    const { trends } = jsonData;
    report += `## 📈 Trend Analysis\n\n`;

    report += `### Health Score\n`;
    report += `- **Current:** ${trends.healthScore.current}/100\n`;
    report += `- **Previous:** ${trends.healthScore.previous}/100\n`;
    report += `- **Change:** ${trends.healthScore.delta >= 0 ? '+' : ''}${trends.healthScore.delta} ${trends.healthScore.direction} ${trends.healthScore.status}\n\n`;

    report += `### Anomalies Count\n`;
    report += `- **Current:** ${trends.anomaliesCount.current}\n`;
    report += `- **Previous:** ${trends.anomaliesCount.previous}\n`;
    report += `- **Change:** ${trends.anomaliesCount.delta >= 0 ? '+' : ''}${trends.anomaliesCount.delta} ${trends.anomaliesCount.direction} ${trends.anomaliesCount.status}\n\n`;

    if (Object.keys(trends.bySeverity).length > 0) {
      report += `### Changes by Severity\n\n`;
      for (const [severity, data] of Object.entries(trends.bySeverity)) {
        report += `- **${severity}:** ${data.previous} → ${data.current} (${data.delta >= 0 ? '+' : ''}${data.delta}) ${data.direction} ${data.status}\n`;
      }
      report += `\n`;
    }

    if (Object.keys(trends.byType).length > 0) {
      report += `### Notable Changes by Type\n\n`;
      const sortedTypes = Object.entries(trends.byType).sort((a, b) => Math.abs(b[1].delta) - Math.abs(a[1].delta));
      for (const [type, data] of sortedTypes.slice(0, 5)) {
        report += `- **${type.replace(/-/g, ' ')}:** ${data.previous} → ${data.current} (${data.delta >= 0 ? '+' : ''}${data.delta}) ${data.direction} ${data.status}\n`;
      }
      report += `\n`;
    }

    if (trends.historical) {
      report += `### Historical Comparison (${trends.historical.period})\n`;
      report += `- **Health Score Change:** ${trends.historical.healthScoreTrend >= 0 ? '+' : ''}${trends.historical.healthScoreTrend}\n`;
      report += `- **Anomalies Change:** ${trends.historical.anomaliesTrend >= 0 ? '+' : ''}${trends.historical.anomaliesTrend}\n\n`;
    }
  }

  // Metrics by Layer
  report += `## 📊 Metrics by Layer\n\n`;
  for (const [layerName, layerData] of Object.entries(layers)) {
    report += `### ${layerName.charAt(0).toUpperCase() + layerName.slice(1)} Layer (${layerData.count} packages)\n`;
    report += `- **Average Instability:** ${layerData.metrics.averageInstability} ${layerData.metrics.averageInstability < 0.3 ? '✅' : layerData.metrics.averageInstability < 0.7 ? '⚠️' : '❌'}\n`;
    report += `- **Average Coupling:** ${layerData.metrics.averageCoupling} deps/pkg ${layerData.metrics.averageCoupling < 5 ? '✅' : '⚠️'}\n`;
    report += `- **Total LOC:** ${layerData.metrics.totalLOC.toLocaleString()}\n`;
    report += `- **Issues:** ${layerData.issues.critical} critical, ${layerData.issues.high} high, ${layerData.issues.medium} medium\n\n`;
  }

  // Recommendations
  if (recommendations.length > 0) {
    report += `## ✅ Recommendations (Prioritized)\n\n`;

    for (const rec of recommendations) {
      report += `### ${rec.priority.charAt(0).toUpperCase() + rec.priority.slice(1)} Priority (${rec.timeframe})\n\n`;

      for (const task of rec.tasks) {
        report += `${rec.tasks.indexOf(task) + 1}. **${task.title}**: ${task.description} (${task.effort})\n`;
      }

      report += `\n`;
    }
  }

  report += `---\n\n`;
  report += `🤖 Generated with [KB Labs DevKit Architecture Tool](https://github.com/kb-labs/devkit)\n`;

  return report;
}

// ============================
// Main Function
// ============================

/**
 * Main entry point
 */
async function main() {
  const rootDir = process.cwd();

  const startTime = Date.now();

  if (options.format !== 'json') {
    log('\n🏗️  KB Labs Architecture Audit\n', 'blue');
    log(`📊 Scanning packages across monorepo...\n`, 'gray');
  }

  // Phase 1: Data Collection
  const packages = findPackages(rootDir).map((pkgPath) => ({
    path: pkgPath,
    dir: path.dirname(pkgPath),
    repository: extractRepoFromPath(pkgPath),
  }));

  if (packages.length === 0) {
    log('⚠️  No KB Labs packages found', 'yellow');
    log('   Run this command from the monorepo root\n', 'gray');
    process.exit(0);
  }

  const { graph, packageData } = buildDependencyGraph(packages);

  if (options.format !== 'json') {
    log(`✅ Found ${graph.size} package(s) (${((Date.now() - startTime) / 1000).toFixed(1)}s)\n`, 'green');
    log(`🔍 Running analysis...\n`, 'gray');
  }

  // Phase 2: Metrics Calculation
  const metrics = calculateMetrics(graph);

  if (options.format !== 'json') {
    log(`✅ Calculated metrics for ${metrics.size} packages (${((Date.now() - startTime) / 1000).toFixed(1)}s)\n`, 'green');
  }

  // Phase 3: Anomaly Detection
  const anomalies = detectAnomalies(graph, metrics);

  if (options.format !== 'json') {
    log(`✅ Detected ${anomalies.length} anomalies (${((Date.now() - startTime) / 1000).toFixed(1)}s)\n`, 'green');
  }

  // Phase 4: Output Generation
  const jsonData = generateJSON(graph, metrics, anomalies, options);

  // Phase 5: Trend Analysis (load historical data and compare)
  const archDir = path.join(rootDir, '.kb', 'architecture');
  const history = loadHistoricalData(archDir);
  const trends = generateTrendAnalysis(jsonData, history);

  if (trends) {
    jsonData.trends = trends;

    if (options.format !== 'json') {
      log(`📊 Trend Analysis:`, 'blue');
      log(
        `   Health Score: ${trends.healthScore.previous} → ${trends.healthScore.current} (${trends.healthScore.delta >= 0 ? '+' : ''}${trends.healthScore.delta}) ${trends.healthScore.direction}`,
        trends.healthScore.status === '✅' ? 'green' : trends.healthScore.status === '❌' ? 'red' : 'yellow'
      );
      log(
        `   Anomalies: ${trends.anomaliesCount.previous} → ${trends.anomaliesCount.current} (${trends.anomaliesCount.delta >= 0 ? '+' : ''}${trends.anomaliesCount.delta}) ${trends.anomaliesCount.direction}`,
        trends.anomaliesCount.status === '✅' ? 'green' : trends.anomaliesCount.status === '❌' ? 'red' : 'yellow'
      );

      if (trends.historical) {
        log(
          `   Over ${trends.historical.period}: Health ${trends.historical.healthScoreTrend >= 0 ? '+' : ''}${trends.historical.healthScoreTrend}, Anomalies ${trends.historical.anomaliesTrend >= 0 ? '+' : ''}${trends.historical.anomaliesTrend}`,
          'gray'
        );
      }

      log('');
    }
  }

  // Filter by layer if specified
  if (options.layer) {
    jsonData.packages = jsonData.packages.filter((p) => p.layer === options.layer);
    jsonData.anomalies = jsonData.anomalies.filter((a) => {
      if (a.package) {return jsonData.packages.some((p) => p.name === a.package);}
      if (a.packages) {return a.packages.some((pkg) => jsonData.packages.some((p) => p.name === pkg));}
      return false;
    });
  }

  // Filter by threshold if specified
  if (options.threshold > 0) {
    jsonData.anomalies = jsonData.anomalies.filter((a) => a.score >= options.threshold);
  }

  // Output based on format
  if (options.format === 'json' || options.ai) {
    console.log(JSON.stringify(jsonData, null, 2));
    process.exit(0);
  }

  if (options.format === 'md' || options.format === 'all') {
    const markdownReport = generateMarkdownReport(jsonData);

    if (options.format === 'md') {
      console.log(markdownReport);
      process.exit(0);
    }

    // Save to file
    const outputDir = path.join(rootDir, '.kb', 'architecture');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(outputDir, `report-${timestamp}.md`);
    const jsonPath = path.join(outputDir, `architecture-${timestamp}.json`);

    fs.writeFileSync(reportPath, markdownReport, 'utf-8');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf-8');

    log(`\n📁 Generated files:`, 'blue');
    log(`   - ${reportPath}`, 'cyan');
    log(`   - ${jsonPath}`, 'cyan');
    log('');
  }

  // Terminal output
  log(`\n📈 Health Score: ${jsonData.metadata.healthScore}/100 (Grade ${jsonData.metadata.healthGrade})\n`, 'blue');

  // Top 10 Issues
  const top10 = jsonData.anomalies.slice(0, 10);
  if (top10.length > 0) {
    log(`🚨 Top ${top10.length} Issues Requiring Attention:\n`, 'red');

    for (let i = 0; i < top10.length; i++) {
      const anomaly = top10[i];
      const emoji = anomaly.severity === 'critical' ? '🔴' : anomaly.severity === 'high' ? '🟠' : '🟡';

      log(`  ${i + 1}. ${emoji} ${anomaly.type.replace(/-/g, ' ')}: ${anomaly.package || anomaly.packages?.join(' ↔ ')} (Score: ${anomaly.score})`, 'yellow');
      log(`     Impact: ${anomaly.impact}`, 'gray');
      log(`     Fix: ${anomaly.recommendation}`, 'gray');
      log('');
    }
  } else {
    log(`✅ No critical anomalies detected!\n`, 'green');
  }

  log(`💡 Tips:`, 'blue');
  log(`   • Use --format=json to get machine-readable output`, 'gray');
  log(`   • Use --format=md to get markdown report`, 'gray');
  log(`   • Use --ai to pipe output to AI agent`, 'gray');
  log(`   • Use --layer=core to filter by specific layer`, 'gray');
  log(`   • Use --threshold=70 to show only high-impact issues`, 'gray');
  log('');

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});
