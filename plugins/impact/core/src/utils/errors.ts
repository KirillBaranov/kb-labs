import { defineError, PluginError, commonErrors } from '@kb-labs/sdk';

export const ImpactError = defineError('IMPACT', {
  WorkspaceNotFound: {
    code: 500,
    message: () => 'Could not find workspace root',
  },
  ConfigInvalid: {
    code: 500,
    message: (detail: string) => `Invalid impact config: ${detail}`,
  },
});

export const CommonError = defineError('COMMON', commonErrors);

export { PluginError };
