/**
 * Staleness propagation and impact score calculation
 */

/**
 * Propagate staleness transitively through dependency graph
 */
export function propagateStaleness(freshnessResults, graph) {
  // Build reverse dependency map for impact calculation
  for (const [pkgName, result] of freshnessResults) {
    const node = graph.get(pkgName);
    if (!node) {continue;}

    // If this package is stale, mark all dependents as affected
    if (result.status === 'stale' || result.status === 'never-built') {
      const affectedCount = propagateStaleFlag(pkgName, graph, freshnessResults, new Set());
      result.impactScore = affectedCount;
    }
  }
}

/**
 * Recursively mark dependents as transitively stale
 */
function propagateStaleFlag(pkgName, graph, results, visited) {
  if (visited.has(pkgName)) {return 0;} // Prevent circular loops
  visited.add(pkgName);

  const node = graph.get(pkgName);
  if (!node) {return 0;}

  let count = node.dependents.size;

  for (const dependent of node.dependents) {
    const depResult = results.get(dependent);

    // Mark dependent as transitively stale (if it's currently fresh)
    if (depResult && depResult.status === 'fresh') {
      depResult.issues.push({
        type: 'transitive-stale',
        severity: 'warning',
        message: `Depends on stale package ${pkgName}`,
        staleDependency: pkgName,
      });
      depResult.status = 'stale';
    }

    // Recursively propagate
    count += propagateStaleFlag(dependent, graph, results, visited);
  }

  return count;
}
