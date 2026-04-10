import { describe, it, expect } from 'vitest';
import { formatHumanReadable } from '../../src/core/formatter.js';
import type { ImpactAnalysisResult } from '@kb-labs/impact-contracts';

describe('formatHumanReadable', () => {
  it('formats full result with all sections', () => {
    const result: ImpactAnalysisResult = {
      packages: {
        direct: [{ name: '@kb-labs/sdk', repo: 'platform/sdk', level: 'direct', changedFiles: 3 }],
        dependent: [{ name: '@kb-labs/core', repo: 'platform/core', level: 'dependent', reason: 'depends on @kb-labs/sdk' }],
        transitive: [],
      },
      docs: {
        stale: [{ file: 'CLI-REFERENCE.md', reason: '@kb-labs/cli changed', action: 'regenerate', command: 'pnpm kb docs generate-cli-reference' }],
        review: [],
        reindex: [],
      },
      tests: {
        mustRun: [
          { name: '@kb-labs/sdk', repo: 'platform/sdk', level: 'direct', hasTests: true, testCount: 12, command: 'pnpm --filter @kb-labs/sdk run test' },
        ],
        noTests: [
          { name: '@kb-labs/core', repo: 'platform/core', level: 'dependent', reason: 'depends on @kb-labs/sdk', hasTests: false },
        ],
      },
      build: {
        steps: [
          { name: '@kb-labs/sdk', repo: 'platform/sdk', level: 'direct', order: 1 },
          { name: '@kb-labs/core', repo: 'platform/core', level: 'dependent', order: 2, reason: 'depends on @kb-labs/sdk' },
        ],
        command: 'pnpm --filter @kb-labs/sdk --filter @kb-labs/core run build',
        totalPackages: 2,
      },
      recommendations: ['Rebuild @kb-labs/core'],
    };

    const output = formatHumanReadable(result);
    expect(output).toContain('Impact Analysis');
    expect(output).toContain('Package Impact');
    expect(output).toContain('3 files changed');
    expect(output).toContain('Build Impact');
    expect(output).toContain('Rebuild (2 packages in order)');
    expect(output).toContain('1.');
    expect(output).toContain('@kb-labs/sdk');
    expect(output).toContain('2.');
    expect(output).toContain('@kb-labs/core');
    expect(output).toContain('pnpm --filter @kb-labs/sdk --filter @kb-labs/core run build');
    expect(output).toContain('Test Impact');
    expect(output).toContain('12 test files');
    expect(output).toContain('NO TESTS');
    expect(output).toContain('Doc Impact');
    expect(output).toContain('Recommendations');
  });

  it('formats empty result', () => {
    const result: ImpactAnalysisResult = {
      packages: { direct: [], dependent: [], transitive: [] },
      docs: { stale: [], review: [], reindex: [] },
      tests: { mustRun: [], noTests: [] },
      build: { steps: [], command: '', totalPackages: 0 },
      recommendations: [],
    };

    const output = formatHumanReadable(result);
    expect(output).toContain('No impact detected');
  });
});
