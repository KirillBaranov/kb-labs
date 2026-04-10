import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import type { ImpactPluginConfig } from '@kb-labs/impact-contracts';
import {
  findWorkspaceRoot,
  detectChangedPackages,
  buildReverseDependencyGraph,
  analyzePackageImpact,
  analyzeDocImpact,
  loadImpactRules,
  formatHumanReadable,
} from '../../core/index.js';

interface DocsFlags {
  json?: boolean;
}

interface DocsInput {
  argv: string[];
  flags: DocsFlags;
}

export default defineCommand<unknown, DocsInput, unknown>({
  id: 'impact:docs',
  description: 'Documentation impact analysis',

  handler: {
    async execute(
      ctx: PluginContextV3<unknown>,
      input: DocsInput,
    ): Promise<CommandResult<unknown>> {
      const flags = input.flags ?? (input as unknown as DocsFlags);

      let root: string;
      try {
        root = findWorkspaceRoot();
      } catch {
        if (flags.json) {ctx.ui?.json?.({ docs: { stale: [], review: [], reindex: [] } });}
        else {ctx.ui?.warn?.('Could not find workspace root');}
        return { exitCode: 1 };
      }

      const changed = detectChangedPackages(root);
      if (changed.length === 0) {
        const empty = { docs: { stale: [], review: [], reindex: [] }, recommendations: [] };
        if (flags.json) {ctx.ui?.json?.(empty);}
        else {ctx.ui?.success?.('No changes detected');}
        return { exitCode: 0, result: empty };
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
      const allImpacted = [...packages.direct, ...packages.dependent];
      const docs = analyzeDocImpact(allImpacted, rules);
      const recommendations: string[] = [];
      for (const d of docs.stale) {
        if (d.command) {recommendations.push(`Run: ${d.command}`);}
      }
      for (const d of docs.reindex) {
        if (d.command) {recommendations.push(`Run: ${d.command}`);}
      }

      const result = { docs, recommendations };

      if (flags.json) {
        ctx.ui?.json?.(result);
      } else {
        ctx.ui?.write?.(formatHumanReadable({
          packages: { direct: [], dependent: [], transitive: [] },
          docs,
          tests: { mustRun: [], noTests: [] },
          build: { steps: [], command: '', totalPackages: 0 },
          recommendations,
        }));
      }

      return { exitCode: 0, result };
    },
  },
});
