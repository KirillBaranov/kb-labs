import type { PluginContracts } from './types';
import { contractsSchemaId, contractsVersion } from './version';

export const pluginContractsManifest: PluginContracts = {
  schema: contractsSchemaId,
  pluginId: '@kb-labs/mind',
  contractsVersion,
  artifacts: {},
  commands: {
    'mind:init': {
      id: 'mind:init',
      description: 'Initialise the Mind workspace structure.',
      input: {
        ref: '@kb-labs/mind-contracts/schema#MindInitCommandInputSchema',
        format: 'zod',
      },
      examples: ['kb mind init --force', 'kb mind init --json'],
    },
    'mind:verify': {
      id: 'mind:verify',
      description: 'Validate Mind indexes and surface inconsistencies.',
      input: {
        ref: '@kb-labs/mind-contracts/schema#MindVerifyCommandInputSchema',
        format: 'zod',
      },
      output: {
        ref: '@kb-labs/mind-contracts/schema#MindVerifyCommandOutputSchema',
        format: 'zod',
      },
      examples: ['kb mind verify', 'kb mind verify --json'],
    },
  },
  workflows: {},
  api: {
    rest: {
      basePath: '/v1/plugins/mind',
      routes: {
        'mind.rest.verify': {
          id: 'mind.rest.verify',
          method: 'GET',
          path: '/verify',
          description: 'Summarise index verification status for Studio dashboards.',
          response: {
            ref: '@kb-labs/mind-contracts/schema#MindVerifyResponseSchema',
            format: 'zod',
          },
        },
      },
    },
  },
};
