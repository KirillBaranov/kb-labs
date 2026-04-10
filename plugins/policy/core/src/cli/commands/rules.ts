import { defineCommand, useConfig, type PluginContextV3 } from '@kb-labs/sdk';
import type { PolicyConfig } from '@kb-labs/policy-contracts';

type RulesInput = {
  json?: boolean;
};

export default defineCommand({
  id: 'policy:rules',
  description: 'Show all policy rules and which categories they apply to',

  handler: {
    async execute(ctx: PluginContextV3, input: RulesInput): Promise<{ exitCode: number }> {
      const flags = (input as { flags?: RulesInput }).flags ?? input;
      const policyConfig = await useConfig<PolicyConfig>();

      if (!policyConfig?.categories || !policyConfig?.rules) {
        ctx.ui.error('No policies config found in .kb/kb.config.json (expected "policies" key)');
        return { exitCode: 1 };
      }

      // Build reverse map: rule → categories that use it
      const ruleToCategories = new Map<string, string[]>();
      for (const [categoryName, categoryConfig] of Object.entries(policyConfig.categories)) {
        for (const rule of categoryConfig.rules) {
          const existing = ruleToCategories.get(rule) ?? [];
          existing.push(categoryName);
          ruleToCategories.set(rule, existing);
        }
      }

      if (flags.json) {
        const output = Object.entries(policyConfig.rules).map(([name, ruleDef]) => ({
          name,
          description: ruleDef.description,
          severity: ruleDef.severity,
          appliedTo: ruleToCategories.get(name) ?? [],
        }));
        ctx.ui.json?.({ rules: output });
      } else {
        const items = Object.entries(policyConfig.rules).map(([name, ruleDef]) => {
          const categories = ruleToCategories.get(name) ?? [];
          const appliedTo = categories.length > 0 ? categories.join(', ') : '(none)';
          return `  ${name}\n    ${ruleDef.description}\n    Applied to: ${appliedTo}\n    Severity: ${ruleDef.severity}`;
        });
        ctx.ui.success?.('Policy Rules', { sections: [{ header: 'Rules', items }] });
      }

      return { exitCode: 0 };
    },
  },
});
