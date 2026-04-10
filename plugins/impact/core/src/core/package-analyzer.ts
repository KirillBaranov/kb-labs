import type { ChangedPackage, DepGraphNode, PackageImpact } from '@kb-labs/impact-contracts';

export function analyzePackageImpact(
  changed: ChangedPackage[],
  graph: Map<string, DepGraphNode>,
): { direct: PackageImpact[]; dependent: PackageImpact[]; transitive: PackageImpact[] } {
  const direct: PackageImpact[] = [];
  const dependent: PackageImpact[] = [];
  const transitive: PackageImpact[] = [];

  const changedNames = new Set(changed.map((c) => c.name));
  const seen = new Set<string>();

  // Direct — packages that changed
  for (const pkg of changed) {
    direct.push({
      name: pkg.name,
      repo: pkg.repo,
      level: 'direct',
      changedFiles: pkg.changedFiles,
    });
    seen.add(pkg.name);
  }

  // BFS from direct to find dependent and transitive
  const queue: Array<{ name: string; depth: number }> = [];

  for (const name of changedNames) {
    const node = graph.get(name);
    if (!node) {continue;}
    for (const dep of node.dependedBy) {
      if (!seen.has(dep)) {
        queue.push({ name: dep, depth: 1 });
      }
    }
  }

  while (queue.length > 0) {
    const { name, depth } = queue.shift()!;
    if (seen.has(name)) {continue;}
    seen.add(name);

    const node = graph.get(name);
    if (!node) {continue;}

    // Find reason (which direct/dependent package it depends on)
    const reasonPkg = node.dependsOn.find((d) => changedNames.has(d) || seen.has(d));
    const impact: PackageImpact = {
      name: node.name,
      repo: node.repo,
      level: depth === 1 ? 'dependent' : 'transitive',
      reason: reasonPkg ? `depends on ${reasonPkg}` : undefined,
    };

    if (depth === 1) {
      dependent.push(impact);
    } else {
      transitive.push(impact);
    }

    // Enqueue next level
    for (const dep of node.dependedBy) {
      if (!seen.has(dep)) {
        queue.push({ name: dep, depth: depth + 1 });
      }
    }
  }

  return { direct, dependent, transitive };
}

export function generateRecommendations(
  packages: { direct: PackageImpact[]; dependent: PackageImpact[]; transitive: PackageImpact[] },
  docs: { stale: Array<{ file?: string }>; review: Array<{ file?: string }>; reindex: Array<{ command?: string }> },
): string[] {
  const recs: string[] = [];

  if (packages.dependent.length > 0) {
    const names = packages.dependent.map((p) => p.name).join(', ');
    recs.push(`Rebuild ${names}`);
  }

  // Collect unique repos that need testing
  const testRepos = new Set([
    ...packages.dependent.map((p) => p.repo),
    ...packages.transitive.map((p) => p.repo),
  ]);
  if (testRepos.size > 0) {
    recs.push(`Run tests in ${[...testRepos].join(', ')}`);
  }

  for (const doc of docs.stale) {
    if (doc.file) {recs.push(`Regenerate ${doc.file}`);}
  }

  for (const doc of docs.review) {
    if (doc.file) {recs.push(`Review ${doc.file}`);}
  }

  for (const doc of docs.reindex) {
    if (doc.command) {recs.push(`Run: ${doc.command}`);}
  }

  return recs;
}
