import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import type { ImpactAnalysisResult, ImpactPluginConfig } from '@kb-labs/impact-contracts';
import {
  findWorkspaceRoot,
  detectChangedPackages,
  buildReverseDependencyGraph,
  analyzePackageImpact,
  generateRecommendations,
  analyzeDocImpact,
  analyzeTestImpact,
  analyzeBuildImpact,
  loadImpactRules,
  formatHumanReadable,
} from '../../core/index.js';

interface CheckFlags {
  json?: boolean;
}

interface CheckInput {
  argv: string[];
  flags: CheckFlags;
}

const EMPTY_RESULT: ImpactAnalysisResult = {
  packages: { direct: [], dependent: [], transitive: [] },
  docs: { stale: [], review: [], reindex: [] },
  tests: { mustRun: [], noTests: [] },
  build: { steps: [], command: '', totalPackages: 0 },
  recommendations: [],
};

export default defineCommand<unknown, CheckInput, ImpactAnalysisResult>({
  id: 'impact:check',
  description: 'Full impact analysis (packages + docs)',

  handler: {
    async execute(
      ctx: PluginContextV3<unknown>,
      input: CheckInput,
    ): Promise<CommandResult<ImpactAnalysisResult>> {
      const flags = input.flags ?? (input as unknown as CheckFlags);

      let root: string;
      try {
        root = findWorkspaceRoot();
      } catch {
        if (flags.json) {ctx.ui?.json?.(EMPTY_RESULT);}
        else {ctx.ui?.warn?.('Could not find workspace root');}
        return { exitCode: 1 };
      }

      const changed = detectChangedPackages(root);
      if (changed.length === 0) {
        if (flags.json) {ctx.ui?.json?.(EMPTY_RESULT);}
        else {ctx.ui?.success?.('No changes detected');}
        return { exitCode: 0, result: EMPTY_RESULT };
      }

      const graph = buildReverseDependencyGraph(root);
      const packages = analyzePackageImpact(changed, graph);

      const useConfigFn = async () => {
        try {
          const { useConfig } = await import('@kb-labs/sdk');
          return await useConfig<Partial<ImpactPluginConfig>>();
        } catch {
          return undefined;
        }
      };

      const rules = await loadImpactRules(useConfigFn);
      const allImpacted = [...packages.direct, ...packages.dependent, ...packages.transitive];
      const docs = analyzeDocImpact(allImpacted, rules);
      const tests = analyzeTestImpact(allImpacted, root);
      const build = analyzeBuildImpact(allImpacted, graph);
      const recommendations = generateRecommendations(packages, docs);
      const result: ImpactAnalysisResult = { packages, docs, tests, build, recommendations };

      if (flags.json) {
        ctx.ui?.json?.(result);
      } else {
        ctx.ui?.write?.(formatHumanReadable(result));
      }

      return { exitCode: 0, result };
    },
  },
});
