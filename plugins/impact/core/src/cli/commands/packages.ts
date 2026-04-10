import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import {
  findWorkspaceRoot,
  detectChangedPackages,
  buildReverseDependencyGraph,
  analyzePackageImpact,
  analyzeTestImpact,
  analyzeBuildImpact,
  formatHumanReadable,
  generateRecommendations,
} from '../../core/index.js';

interface PkgFlags {
  json?: boolean;
}

interface PkgInput {
  argv: string[];
  flags: PkgFlags;
}

export default defineCommand<unknown, PkgInput, unknown>({
  id: 'impact:packages',
  description: 'Package dependency impact analysis',

  handler: {
    async execute(
      ctx: PluginContextV3<unknown>,
      input: PkgInput,
    ): Promise<CommandResult<unknown>> {
      const flags = input.flags ?? (input as unknown as PkgFlags);

      let root: string;
      try {
        root = findWorkspaceRoot();
      } catch {
        if (flags.json) {ctx.ui?.json?.({ packages: { direct: [], dependent: [], transitive: [] } });}
        else {ctx.ui?.warn?.('Could not find workspace root');}
        return { exitCode: 1 };
      }

      const changed = detectChangedPackages(root);
      if (changed.length === 0) {
        const empty = { packages: { direct: [], dependent: [], transitive: [] }, tests: { mustRun: [], noTests: [] }, recommendations: [] };
        if (flags.json) {ctx.ui?.json?.(empty);}
        else {ctx.ui?.success?.('No changes detected');}
        return { exitCode: 0, result: empty };
      }

      const graph = buildReverseDependencyGraph(root);
      const packages = analyzePackageImpact(changed, graph);
      const allImpacted = [...packages.direct, ...packages.dependent, ...packages.transitive];
      const tests = analyzeTestImpact(allImpacted, root);
      const build = analyzeBuildImpact(allImpacted, graph);
      const recommendations = generateRecommendations(packages, { stale: [], review: [], reindex: [] });
      const result = { packages, tests, build, recommendations };

      if (flags.json) {
        ctx.ui?.json?.(result);
      } else {
        ctx.ui?.write?.(formatHumanReadable({
          packages,
          docs: { stale: [], review: [], reindex: [] },
          tests,
          build,
          recommendations,
        }));
      }

      return { exitCode: 0, result };
    },
  },
});
