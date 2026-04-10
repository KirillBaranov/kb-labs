import { describe, it, expect } from 'vitest';
import { analyzeBuildImpact } from '../../src/core/build-analyzer.js';
import type { DepGraphNode, PackageImpact } from '@kb-labs/impact-contracts';

function node(name: string, repo: string, dependsOn: string[] = [], dependedBy: string[] = []): DepGraphNode {
  return { name, repo, dependsOn, dependedBy };
}

describe('analyzeBuildImpact', () => {
  it('returns topologically sorted build order', () => {
    const graph = new Map<string, DepGraphNode>();
    graph.set('@kb-labs/sdk', node('@kb-labs/sdk', 'platform/sdk', [], ['@kb-labs/core']));
    graph.set('@kb-labs/core', node('@kb-labs/core', 'platform/core', ['@kb-labs/sdk'], ['@kb-labs/cli']));
    graph.set('@kb-labs/cli', node('@kb-labs/cli', 'platform/cli', ['@kb-labs/core'], []));

    const impacted: PackageImpact[] = [
      { name: '@kb-labs/cli', repo: 'platform/cli', level: 'transitive', reason: 'depends on @kb-labs/core' },
      { name: '@kb-labs/sdk', repo: 'platform/sdk', level: 'direct', changedFiles: 3 },
      { name: '@kb-labs/core', repo: 'platform/core', level: 'dependent', reason: 'depends on @kb-labs/sdk' },
    ];

    const result = analyzeBuildImpact(impacted, graph);

    expect(result.totalPackages).toBe(3);
    // sdk must come first (no deps), then core, then cli
    expect(result.steps[0].name).toBe('@kb-labs/sdk');
    expect(result.steps[0].order).toBe(1);
    expect(result.steps[1].name).toBe('@kb-labs/core');
    expect(result.steps[1].order).toBe(2);
    expect(result.steps[2].name).toBe('@kb-labs/cli');
    expect(result.steps[2].order).toBe(3);

    expect(result.command).toContain('--filter @kb-labs/sdk');
    expect(result.command).toContain('--filter @kb-labs/core');
    expect(result.command).toContain('--filter @kb-labs/cli');
  });

  it('handles independent packages (no deps between them)', () => {
    const graph = new Map<string, DepGraphNode>();
    graph.set('@kb-labs/a', node('@kb-labs/a', 'r/a'));
    graph.set('@kb-labs/b', node('@kb-labs/b', 'r/b'));

    const impacted: PackageImpact[] = [
      { name: '@kb-labs/a', repo: 'r/a', level: 'direct', changedFiles: 1 },
      { name: '@kb-labs/b', repo: 'r/b', level: 'direct', changedFiles: 1 },
    ];

    const result = analyzeBuildImpact(impacted, graph);
    expect(result.totalPackages).toBe(2);
    // Both have order, doesn't matter which is first
    expect(result.steps.map((s) => s.name).sort()).toEqual(['@kb-labs/a', '@kb-labs/b']);
  });

  it('returns empty plan for no packages', () => {
    const result = analyzeBuildImpact([], new Map());
    expect(result.totalPackages).toBe(0);
    expect(result.steps).toHaveLength(0);
    expect(result.command).toBe('');
  });
});
