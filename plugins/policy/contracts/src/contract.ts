import { contractsSchemaId, contractsVersion } from './version.js';

export const pluginContractsManifest = {
  schema: contractsSchemaId,
  pluginId: '@kb-labs/policy',
  contractsVersion,
} as const;
