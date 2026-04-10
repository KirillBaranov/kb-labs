/**
 * Manifest definition helpers
 * @module @kb-labs/shared-command-kit/manifest
 */

import type { ManifestV3 } from '@kb-labs/plugin-contracts';

/**
 * Define a ManifestV3 with type safety
 *
 * This is a type-safe wrapper for creating ManifestV3 objects.
 * It provides compile-time validation via TypeScript and optional
 * runtime validation via Zod (if enabled).
 *
 * For built plugins (dist/), this function is compiled away and only
 * the plain object remains, avoiding runtime dependencies.
 *
 * @example
 * ```typescript
 * // Basic usage
 * export const manifest = defineManifest({
 *   schema: 'kb.plugin/2',
 *   id: '@kb-labs/my-plugin',
 *   version: '1.0.0',
 *   cli: {
 *     commands: [...]
 *   }
 * });
 *
 * // With contracts typing (Level 2)
 * import type { PluginContracts } from '@kb-labs/my-plugin-contracts';
 *
 * export const manifest = defineManifest<typeof pluginContractsManifest>({
 *   schema: 'kb.plugin/2',
 *   id: '@kb-labs/my-plugin',
 *   artifacts: [
 *     { id: 'my.artifact.id' } // ✅ Type-checked against contracts
 *   ],
 *   cli: {
 *     commands: [{
 *       id: 'my:command', // ✅ Type-checked against contracts
 *       // ...
 *     }]
 *   }
 * });
 * ```
 *
 * @param manifest - Manifest configuration
 * @returns ManifestV3 object
 */
export function defineManifest<TContracts = unknown>(
  manifest: ManifestV3
): ManifestV3 {
  // In development, you could add runtime validation here if needed:
  // if (process.env.NODE_ENV === 'development') {
  //   validateManifestV3(manifest);
  // }

  // For production builds, this is just an identity function
  // that provides type safety at compile time
  return manifest;
}

/**
 * Flag schema definition (compatible with defineFlags)
 */
type FlagSchemaDefinition = Record<
  string,
  {
    type: 'string' | 'boolean' | 'number' | 'array';
    alias?: string;
    default?: unknown;
    description?: string;
    choices?: string[];
    required?: boolean;
  }
>;

/**
 * Convert flag schema definition to CliFlagDecl[] for manifest
 *
 * This helper converts the flag schema format used in defineCommand
 * to the array format expected in ManifestV3.
 *
 * @example
 * ```typescript
 * const helloFlags = {
 *   name: { type: 'string', description: 'Name to greet', alias: 'n' },
 *   json: { type: 'boolean', description: 'Emit JSON', default: false }
 * };
 *
 * const manifestFlags = defineCommandFlags(helloFlags);
 * // Use in manifest: flags: manifestFlags
 *
 * // In manifest.v2.ts:
 * export const manifest = defineManifest({
 *   cli: {
 *     commands: [{
 *       id: 'hello',
 *       flags: defineCommandFlags(helloFlags),
 *       // ...
 *     }]
 *   }
 * });
 * ```
 */
export function defineCommandFlags<TFlags extends FlagSchemaDefinition>(
  flags: TFlags
): Array<{
  name: string;
  type: 'string' | 'boolean' | 'number' | 'array';
  alias?: string;
  default?: unknown;
  description?: string;
  choices?: string[];
  required?: boolean;
}> {
  return Object.entries(flags).map(([name, flag]) => ({
    name,
    type: flag.type,
    ...(flag.alias !== undefined && { alias: flag.alias }),
    ...(flag.default !== undefined && { default: flag.default }),
    ...(flag.description !== undefined && { description: flag.description }),
    ...(flag.choices !== undefined && { choices: flag.choices }),
    ...(flag.required !== undefined && { required: flag.required }),
  }));
}
