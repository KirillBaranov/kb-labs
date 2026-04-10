import type { ImpactPluginConfig } from './types.js';

export const DEFAULT_IMPACT_CONFIG: ImpactPluginConfig = {
  docRules: [
    { match: '@kb-labs/sdk', docs: ['CLAUDE.md', 'CONTRIBUTING.md'], action: 'review' },
    {
      match: '*-cli',
      docs: ['CLI-REFERENCE.md'],
      action: 'regenerate',
      command: 'pnpm kb docs generate-cli-reference',
    },
    {
      match: '@kb-labs/mind-*',
      action: 'reindex',
      command: 'pnpm kb mind rag-index --scope default',
    },
    { match: '@kb-labs/workflow-*', docs: ['docs/DEVELOPMENT-PROCESS.md'], action: 'review' },
    { match: '__new_package__', action: 'regenerate', command: 'pnpm map' },
  ],
};
