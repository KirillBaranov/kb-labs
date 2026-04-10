import { describe, it, expect } from 'vitest';
import { analyzeDocImpact } from '../../src/core/doc-analyzer.js';
import type { ImpactPluginConfig, PackageImpact } from '@kb-labs/impact-contracts';

const config: ImpactPluginConfig = {
  docRules: [
    { match: '@kb-labs/sdk', docs: ['CLAUDE.md'], action: 'review' },
    { match: '*-cli', docs: ['CLI-REFERENCE.md'], action: 'regenerate', command: 'pnpm kb docs generate-cli-reference' },
    { match: '@kb-labs/mind-*', action: 'reindex', command: 'pnpm kb mind rag-index --scope default' },
  ],
};

describe('analyzeDocImpact', () => {
  it('matches exact package names', () => {
    const impacted: PackageImpact[] = [{ name: '@kb-labs/sdk', repo: 'platform/sdk', level: 'direct' }];
    const result = analyzeDocImpact(impacted, config);
    expect(result.review).toHaveLength(1);
    expect(result.review[0].file).toBe('CLAUDE.md');
  });

  it('matches suffix glob (*-cli)', () => {
    const impacted: PackageImpact[] = [{ name: '@kb-labs/agent-cli', repo: 'plugins/agents', level: 'direct' }];
    const result = analyzeDocImpact(impacted, config);
    expect(result.stale).toHaveLength(1);
    expect(result.stale[0].file).toBe('CLI-REFERENCE.md');
    expect(result.stale[0].command).toBe('pnpm kb docs generate-cli-reference');
  });

  it('matches prefix glob (@kb-labs/mind-*)', () => {
    const impacted: PackageImpact[] = [{ name: '@kb-labs/mind-engine', repo: 'plugins/mind', level: 'direct' }];
    const result = analyzeDocImpact(impacted, config);
    expect(result.reindex).toHaveLength(1);
    expect(result.reindex[0].command).toBe('pnpm kb mind rag-index --scope default');
  });

  it('deduplicates matching docs', () => {
    const impacted: PackageImpact[] = [
      { name: '@kb-labs/agent-cli', repo: 'plugins/agents', level: 'direct' },
      { name: '@kb-labs/commit-cli', repo: 'plugins/commit', level: 'dependent' },
    ];
    const result = analyzeDocImpact(impacted, config);
    // CLI-REFERENCE.md should appear only once despite 2 *-cli packages
    expect(result.stale).toHaveLength(1);
  });

  it('returns empty for no matching rules', () => {
    const impacted: PackageImpact[] = [{ name: '@kb-labs/unrelated', repo: 'platform/x', level: 'direct' }];
    const result = analyzeDocImpact(impacted, config);
    expect(result.stale).toHaveLength(0);
    expect(result.review).toHaveLength(0);
    expect(result.reindex).toHaveLength(0);
  });
});
