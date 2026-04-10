import type { DocImpact, ImpactPluginConfig, PackageImpact } from '@kb-labs/impact-contracts';

function matchesRule(packageName: string, pattern: string): boolean {
  if (pattern === packageName) {return true;}
  if (pattern === '__new_package__') {return false;} // handled separately

  // Simple glob: *-cli matches @kb-labs/agent-cli
  if (pattern.startsWith('*')) {
    return packageName.endsWith(pattern.slice(1));
  }
  if (pattern.endsWith('*')) {
    return packageName.startsWith(pattern.slice(0, -1));
  }

  return false;
}

export function analyzeDocImpact(
  impactedPackages: PackageImpact[],
  config: ImpactPluginConfig,
): { stale: DocImpact[]; review: DocImpact[]; reindex: DocImpact[] } {
  const stale: DocImpact[] = [];
  const review: DocImpact[] = [];
  const reindex: DocImpact[] = [];

  const seenDocs = new Set<string>();

  for (const pkg of impactedPackages) {
    for (const rule of config.docRules) {
      if (!matchesRule(pkg.name, rule.match)) {continue;}

      if (rule.action === 'reindex') {
        const key = `reindex:${rule.command ?? ''}`;
        if (!seenDocs.has(key)) {
          seenDocs.add(key);
          reindex.push({
            reason: `${pkg.name} changed`,
            action: 'reindex',
            command: rule.command,
          });
        }
        continue;
      }

      for (const doc of rule.docs ?? []) {
        const key = `${rule.action}:${doc}`;
        if (seenDocs.has(key)) {continue;}
        seenDocs.add(key);

        const impact: DocImpact = {
          file: doc,
          reason: `${pkg.name} changed`,
          action: rule.action,
          command: rule.command,
        };

        if (rule.action === 'regenerate') {stale.push(impact);}
        else {review.push(impact);}
      }
    }
  }

  return { stale, review, reindex };
}
