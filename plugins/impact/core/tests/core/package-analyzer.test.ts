import { describe, it, expect } from 'vitest';
import { analyzePackageImpact, generateRecommendations } from '../../src/core/package-analyzer.js';
import type { ChangedPackage, DepGraphNode } from '@kb-labs/impact-contracts';

function node(name: string, repo: string, dependsOn: string[] = [], dependedBy: string[] = []): DepGraphNode {
  return { name, repo, dependsOn, dependedBy };
}

describe('analyzePackageImpact', () => {
  it('classifies direct, dependent, and transitive packages', () => {
    const graph = new Map<string, DepGraphNode>();
    graph.set('@kb-labs/sdk', node('@kb-labs/sdk', 'platform/sdk', [], ['@kb-labs/core', '@kb-labs/cli']));
    graph.set('@kb-labs/core', node('@kb-labs/core', 'platform/core', ['@kb-labs/sdk'], ['@kb-labs/agent']));
    graph.set('@kb-labs/cli', node('@kb-labs/cli', 'platform/cli', ['@kb-labs/sdk'], []));
    graph.set('@kb-labs/agent', node('@kb-labs/agent', 'plugins/agents', ['@kb-labs/core'], []));

    const changed: ChangedPackage[] = [{ name: '@kb-labs/sdk', repo: 'platform/sdk', changedFiles: 3 }];

    const result = analyzePackageImpact(changed, graph);

    expect(result.direct).toHaveLength(1);
    expect(result.direct[0].name).toBe('@kb-labs/sdk');
    expect(result.direct[0].changedFiles).toBe(3);

    expect(result.dependent).toHaveLength(2);
    const depNames = result.dependent.map((p) => p.name).sort();
    expect(depNames).toEqual(['@kb-labs/cli', '@kb-labs/core']);

    expect(result.transitive).toHaveLength(1);
    expect(result.transitive[0].name).toBe('@kb-labs/agent');
  });

  it('deduplicates across levels', () => {
    const graph = new Map<string, DepGraphNode>();
    graph.set('@kb-labs/a', node('@kb-labs/a', 'r/a', [], ['@kb-labs/b']));
    graph.set('@kb-labs/b', node('@kb-labs/b', 'r/b', ['@kb-labs/a'], []));

    // Both a and b changed — b should be direct, not dependent
    const changed: ChangedPackage[] = [
      { name: '@kb-labs/a', repo: 'r/a', changedFiles: 1 },
      { name: '@kb-labs/b', repo: 'r/b', changedFiles: 2 },
    ];

    const result = analyzePackageImpact(changed, graph);
    expect(result.direct).toHaveLength(2);
    expect(result.dependent).toHaveLength(0);
  });

  it('handles empty input', () => {
    const result = analyzePackageImpact([], new Map());
    expect(result.direct).toHaveLength(0);
    expect(result.dependent).toHaveLength(0);
    expect(result.transitive).toHaveLength(0);
  });
});

describe('generateRecommendations', () => {
  it('generates rebuild and test recommendations', () => {
    const packages = {
      direct: [{ name: '@kb-labs/sdk', repo: 'platform/sdk', level: 'direct' as const }],
      dependent: [{ name: '@kb-labs/core', repo: 'platform/core', level: 'dependent' as const, reason: 'depends on @kb-labs/sdk' }],
      transitive: [],
    };
    const docs = { stale: [{ file: 'CLI-REFERENCE.md', reason: 'changed', action: 'regenerate' as const }], review: [], reindex: [] };

    const recs = generateRecommendations(packages, docs);
    expect(recs).toContain('Rebuild @kb-labs/core');
    expect(recs.some((r) => r.includes('Run tests'))).toBe(true);
    expect(recs.some((r) => r.includes('CLI-REFERENCE.md'))).toBe(true);
  });
});
