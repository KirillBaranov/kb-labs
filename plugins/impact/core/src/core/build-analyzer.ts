import type { BuildImpact, BuildPlan, DepGraphNode, PackageImpact } from '@kb-labs/impact-contracts';

/**
 * Topological sort of impacted packages — returns correct build order.
 * Uses Kahn's algorithm on the subgraph of only affected packages.
 */
export function analyzeBuildImpact(
  allImpacted: PackageImpact[],
  graph: Map<string, DepGraphNode>,
): BuildPlan {
  const impactedNames = new Set(allImpacted.map((p) => p.name));
  const impactedMap = new Map(allImpacted.map((p) => [p.name, p]));

  // Build subgraph of only impacted packages
  const inDegree = new Map<string, number>();
  const deps = new Map<string, string[]>(); // name → deps that are also impacted

  for (const name of impactedNames) {
    const node = graph.get(name);
    const filteredDeps = (node?.dependsOn ?? []).filter((d) => impactedNames.has(d));
    deps.set(name, filteredDeps);
    inDegree.set(name, filteredDeps.length);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) {queue.push(name);}
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    // Find packages that depend on current (and are in our impacted set)
    const node = graph.get(current);
    if (node) {
      for (const dependent of node.dependedBy) {
        if (!impactedNames.has(dependent)) {continue;}
        const deg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, deg);
        if (deg === 0) {queue.push(dependent);}
      }
    }
  }

  // If some packages weren't reached (circular deps), append them at the end
  for (const name of impactedNames) {
    if (!sorted.includes(name)) {sorted.push(name);}
  }

  const steps: BuildImpact[] = sorted.map((name, idx) => {
    const pkg = impactedMap.get(name)!;
    return {
      name: pkg.name,
      repo: pkg.repo,
      level: pkg.level,
      order: idx + 1,
      reason: pkg.reason,
    };
  });

  // Generate a single command that builds in order
  const filterArgs = sorted.map((name) => `--filter ${name}`).join(' ');
  const command = sorted.length > 0
    ? `pnpm ${filterArgs} run build`
    : '';

  return {
    steps,
    command,
    totalPackages: steps.length,
  };
}
