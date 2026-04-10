import { z } from 'zod';
import { contractsSchemaId } from '../version.js';

export const pluginContractsSchema = z
  .object({
    schema: z.literal(contractsSchemaId),
    pluginId: z.string().min(1),
    contractsVersion: z.string().min(1),
  })
  .strict();

export type PluginContractsSchema = z.infer<typeof pluginContractsSchema>;

export function parsePluginContracts(input: unknown) {
  return pluginContractsSchema.parse(input);
}
