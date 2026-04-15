/**
 * @kb-labs/cli-commands/registry
 * Manifest validation and registration with shadowing support
 */

import Ajv from 'ajv';
import type { CommandManifest, DiscoveryResult, RegisteredCommand } from './types';
import { checkRequires } from './availability';
import type { ILogger } from '@kb-labs/core-platform';
import { platform } from '@kb-labs/core-runtime';
import { getLogLevel } from '@kb-labs/cli-runtime';

export interface RegisterManifestsOptions {
  cwd?: string;
}

const ajv = new Ajv();

// Flag validation schema
const flagSchema = {
  type: 'object',
  required: ['name', 'type'],
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    type: { enum: ['string', 'boolean', 'number', 'array'] },
    alias: { type: 'string', pattern: '^[a-z]$' }, // single letter
    description: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' } },
    required: { type: 'boolean' },
    default: {}, // must match type
  },
};

// Manifest schema with required manifestVersion
const manifestSchema = {
  type: 'object',
  required: ['manifestVersion', 'id', 'group', 'describe', 'loader'],
  additionalProperties: true,
  properties: {
    manifestVersion: { type: 'string', enum: ['1.0'] },
    id: { type: 'string', pattern: '^[a-z0-9-]+(?::[a-z0-9-]+)*$' }, // Simple or namespaced (colon-separated)
    aliases: { type: 'array', items: { type: 'string' } },
    group: { type: 'string' },
    describe: { type: 'string' },
    longDescription: { type: 'string' },
    requires: { type: 'array', items: { type: 'string' } },
    flags: { 
      type: 'array', 
      items: flagSchema 
    },
    examples: { type: 'array', items: { type: 'string' } },
  },
};

const validateManifest = ajv.compile(manifestSchema);
const validateFlag = ajv.compile(flagSchema);

/**
 * Validate flag definition
 */
function validateFlagDef(flag: any, manifestId: string): void {
  if (!validateFlag(flag)) {
    throw new Error(
      `Invalid flag "${flag.name}" in ${manifestId}: ${ajv.errorsText(validateFlag.errors)}`
    );
  }
  
  // Validate choices only for string type
  if (flag.choices && flag.type !== 'string') {
    throw new Error(`Flag "${flag.name}" in ${manifestId}: choices allowed only for string type`);
  }
  
  // Validate default matches type
  if (flag.default !== undefined) {
    const typeMatches = 
      (flag.type === 'string' && typeof flag.default === 'string') ||
      (flag.type === 'boolean' && typeof flag.default === 'boolean') ||
      (flag.type === 'number' && typeof flag.default === 'number') ||
      (flag.type === 'array' && Array.isArray(flag.default));
    
    if (!typeMatches) {
      throw new Error(
        `Flag "${flag.name}" in ${manifestId}: default value type mismatch (expected ${flag.type})`
      );
    }
  }
}

/**
 * Validate single manifest
 */
function validateManifestStructure(manifest: any): void {
  if (!validateManifest(manifest)) {
    throw new Error(`Invalid manifest ${manifest.id}: ${ajv.errorsText(validateManifest.errors)}`);
  }
  
  // Validate manifestVersion (now required)
  if (manifest.manifestVersion !== '1.0') {
    throw new Error(
      `Unsupported manifestVersion "${manifest.manifestVersion}" in ${manifest.id} (expected "1.0")`
    );
  }
  
  // Validate flags if present
  if (manifest.flags && Array.isArray(manifest.flags) && manifest.id) {
    for (const flag of manifest.flags) {
      if (flag && typeof flag === 'object' && flag.name) {
        validateFlagDef(flag, manifest.id as string);
      }
    }
  }
}

/**
 * Priority order for source resolution
 */
const SOURCE_PRIORITY: Record<string, number> = {
  builtin: 4,
  workspace: 3,
  linked: 2,
  node_modules: 1,
};

/**
 * Normalize command ID to ensure it follows namespace:command format
 */
function normalizeCommandId(id: string, _namespace: string): string {
  // IDs are now simple (no namespace prefix) - return as-is
  return id;
}

/**
 * Generate whitespace aliases from command ID
 * Example: "devlink:apply" -> ["devlink apply"]
 */
function generateWhitespaceAliases(id: string): string[] {
  if (!id.includes(':')) {
    return [];
  }
  // Replace colon with space
  return [id.replace(':', ' ')];
}

/**
 * Normalize aliases: ensure they're valid and add whitespace variants
 */
function normalizeAliases(manifest: CommandManifest, logger?: ILogger): string[] {
  const log = logger ?? platform.logger;
  const aliases = new Set<string>();
  const _namespace = manifest.namespace || manifest.group;

  // Add existing aliases
  if (manifest.aliases) {
    for (const alias of manifest.aliases) {
      // Validate alias format (no spaces, no special chars except hyphens)
      if (!/^[a-z0-9-:]+$/i.test(alias)) {
        log.warn(`Invalid alias "${alias}" in ${manifest.id}: aliases must be alphanumeric with hyphens or colons`);
        continue;
      }
      aliases.add(alias);
    }
  }

  // Add whitespace alias for scoped commands
  const whitespaceAliases = generateWhitespaceAliases(manifest.id);
  for (const alias of whitespaceAliases) {
    aliases.add(alias);
  }

  return Array.from(aliases);
}

/**
 * Check for namespace collision (same namespace, different commands with same base name)
 */
function checkNamespaceCollision(
  manifest: CommandManifest,
  existing: RegisteredCommand,
  namespace: string
): void {
  // IDs are now simple (no colon prefix), check group instead
  const existingGroup = existing.manifest.group || '';
  const currentGroup = manifest.group || '';

  // If both are in the same group and have same command ID, that's a collision
  if (existingGroup === currentGroup && existingGroup === namespace && existing.manifest.id === manifest.id) {
    // Same group + same ID = collision
    throw new Error(
      `Command collision in group "${namespace}": "${manifest.id}" conflicts with existing "${existing.manifest.id}". ` +
      `Rename one of the commands to use a different ID (e.g., "${manifest.id}2" or use --alias to create a different alias).`
    );
  }
}

/**
 * Get priority for source
 */
function getSourcePriority(source: string): number {
  return SOURCE_PRIORITY[source] || 0;
}

/**
 * Check collision with actionable error message
 */
function checkCollision(
  manifest: CommandManifest,
  existing: RegisteredCommand,
  currentSource: string,
  namespace: string
): { shouldShadow: boolean; message?: string } {
  const existingPriority = getSourcePriority(existing.source);
  const currentPriority = getSourcePriority(currentSource);
  
  // Same namespace collision (hard error)
  checkNamespaceCollision(manifest, existing, namespace);
  
  // If both are from workspace, that's a hard error
  if (currentSource === 'workspace' && existing.source === 'workspace') {
    throw new Error(
      `Command ID collision: "${manifest.id}" is exported by multiple workspace packages. ` +
      `This is not allowed. Please rename one of the commands to use a different ID.`
    );
  }
  
  // Higher priority wins
  if (currentPriority > existingPriority) {
    return { shouldShadow: true };
  } else if (currentPriority < existingPriority) {
    return { shouldShadow: false };
  }
  
  // Same priority - first wins (shouldn't happen with proper sorting)
  return { shouldShadow: false };
}

export interface SkippedManifest {
  id: string;
  source: string;
  reason: string;
}

export interface ManifestRegistrationResult {
  registered: RegisteredCommand[];
  skipped: SkippedManifest[];
  collisions: number;
  errors: number;
}

export function preflightManifests(
  discoveryResults: DiscoveryResult[],
  logger?: ILogger
): { valid: DiscoveryResult[]; skipped: SkippedManifest[] } {
  const log = logger ?? platform.logger;
  const logLevel = getLogLevel();
  const valid: DiscoveryResult[] = [];
  const skipped: SkippedManifest[] = [];

  for (const result of discoveryResults) {
    const allowed: CommandManifest[] = [];

    for (const manifest of result.manifests) {
      try {
        validateManifestStructure(manifest);
        allowed.push(manifest);
      } catch (error: any) {
        const reason = error?.message ? String(error.message) : 'Validation failed';
        const manifestId = manifest?.id || manifest?.group || result.packageName || 'unknown';
        skipped.push({
          id: manifestId,
          source: result.source,
          reason,
        });
        log.warn(`Preflight skipped manifest ${manifestId}: ${reason}`);
        if (logLevel === 'debug') {
          process.stderr.write(`[debug][preflight] skipped ${manifestId} (${result.source}): ${reason}\n`);
        }
      }
    }

    if (allowed.length > 0) {
      valid.push({
        ...result,
        manifests: allowed,
      });
    }
  }

  return { valid, skipped };
}

/**
 * Register manifests with shadowing and collision detection
 */
export async function registerManifests(
  discoveryResults: DiscoveryResult[],
  registry: any, // CommandRegistry interface
  options: RegisterManifestsOptions & { logger?: ILogger } = {}
): Promise<ManifestRegistrationResult> {
  const log = options.logger ?? platform.logger;
  const registered: RegisteredCommand[] = [];
  const skipped: SkippedManifest[] = [];
  const globalIds = new Map<string, RegisteredCommand>();
  const globalAliases = new Map<string, RegisteredCommand>();
  const logLevel = getLogLevel();

  let collisions = 0;
  let errors = 0;

  const sorted = [...discoveryResults].sort((a, b) => {
    const priorityA = getSourcePriority(a.source);
    const priorityB = getSourcePriority(b.source);
    return priorityB - priorityA;
  });

  for (const result of sorted) {
    for (const manifest of result.manifests) {
      const manifestId = manifest.id || manifest.group || 'unknown';
      const namespace = manifest.namespace || manifest.group;

      try {
        try {
          validateManifestStructure(manifest);
        } catch (err: any) {
          throw new Error(`Validation failed: ${err.message}`);
        }

        const normalizedId = normalizeCommandId(manifest.id, namespace);
        if (normalizedId !== manifest.id) {
          log.warn(`Command ID "${manifest.id}" normalized to "${normalizedId}"`);
          manifest.id = normalizedId;
        }

        const normalizedAliases = normalizeAliases(manifest, log);
        if (normalizedAliases.length > 0) {
          manifest.aliases = normalizedAliases;
        }

        const availability = checkRequires(manifest, {
          cwd: options.cwd ?? result.pkgRoot,
        });

        const cmd: RegisteredCommand = {
          manifest,
          v3Manifest: (manifest as any).manifestV2, // Extract V3 manifest from legacy field
          available: availability.available,
          unavailableReason: availability.available ? undefined : availability.reason,
          hint: availability.available ? undefined : availability.hint,
          source: result.source,
          shadowed: false,
          pkgRoot: result.pkgRoot,
          packageName: result.packageName,
        };

        try {
          const manifestModule = await import(result.manifestPath);

          if (manifestModule.init && typeof manifestModule.init === 'function') {
            await manifestModule.init({
              cwd: result.pkgRoot,
              package: result.packageName,
              manifest: cmd.manifest,
            });
          }

          if (manifestModule.register && typeof manifestModule.register === 'function') {
            await manifestModule.register({
              registry,
              command: cmd,
              cwd: result.pkgRoot,
              package: result.packageName,
            });
          }

          if (manifestModule.dispose && typeof manifestModule.dispose === 'function') {
            (cmd as any)._disposeHook = manifestModule.dispose;
          }
        } catch (hookError: any) {
          log.debug(`Lifecycle hooks unavailable for ${manifest.id}: ${hookError.message}`);
        }

        // Use canonical key (group:id) for collision detection so that
        // agent:run and workflow:run are treated as distinct commands.
        const canonicalKey = manifest.group ? `${manifest.group}:${manifest.id}` : manifest.id;
        const existing = globalIds.get(canonicalKey);
        if (existing) {
          const collision = checkCollision(manifest, existing, result.source, namespace);
          if (collision.shouldShadow) {
            existing.shadowed = true;
            globalIds.set(canonicalKey, cmd);
            if (logLevel === 'info' || logLevel === 'debug') {
              log.info(`${canonicalKey} from ${result.source} shadows ${existing.source} version`);
            }
          } else {
            cmd.shadowed = true;
            if (logLevel === 'info' || logLevel === 'debug') {
              log.info(`${canonicalKey} from ${result.source} shadowed by ${existing.source} version`);
            }
          }
        } else {
          globalIds.set(canonicalKey, cmd);
        }

        const aliasesToCheck = manifest.aliases || [];
        for (const alias of aliasesToCheck) {
          const existingAlias = globalAliases.get(alias);
          if (existingAlias) {
            if (existingAlias.manifest.id === manifest.id) {
              continue;
            }

            const existingPriority = getSourcePriority(existingAlias.source);
            const currentPriority = getSourcePriority(result.source);

            if (currentPriority > existingPriority) {
              existingAlias.shadowed = true;
              globalAliases.set(alias, cmd);
              if (logLevel === 'info' || logLevel === 'debug') {
                log.info(`Alias "${alias}" from ${result.source} shadows ${existingAlias.source} version`);
              }
            } else if (currentPriority < existingPriority) {
              if (logLevel === 'info' || logLevel === 'debug') {
                log.info(`Alias "${alias}" from ${result.source} shadowed by ${existingAlias.source} version`);
              }
              continue;
            } else {
              collisions++;
              throw new Error(
                `Alias collision: "${alias}" used by both ${manifest.id} and ${existingAlias.manifest.id}. ` +
                `Rename one alias or use a different namespace.`
              );
            }
          }

          if (globalIds.has(alias)) {
            const conflictingCmd = globalIds.get(alias)!;
            const existingPriority = getSourcePriority(conflictingCmd.source);
            const currentPriority = getSourcePriority(result.source);

            if (currentPriority > existingPriority) {
              log.warn(`Alias "${alias}" conflicts with command ID "${alias}". Alias will shadow command.`);
              globalAliases.set(alias, cmd);
            } else {
              throw new Error(
                `Alias "${alias}" conflicts with existing command ID "${alias}". ` +
                `Rename the alias or use a different name.`
              );
            }
          } else {
            globalAliases.set(alias, cmd);
          }
        }

        if (!cmd.shadowed) {
          registry.registerManifest(cmd);
        }

        registered.push(cmd);
      } catch (error: any) {
        errors++;
        const reason = error?.message ? String(error.message) : String(error);
        skipped.push({
          id: manifestId,
          source: result.source,
          reason,
        });
        log.error(`Skipped manifest ${manifestId} (${result.source}): ${reason}`);
        continue;
      }
    }
  }

  if (skipped.length > 0) {
    log.warn(`Skipped ${skipped.length} manifest(s) during registration`);
    for (const skip of skipped) {
      log.warn(`  • ${skip.id} [${skip.source}] → ${skip.reason}`);
    }
  }

  return {
    registered,
    skipped,
    collisions,
    errors,
  };
}

/**
 * Dispose all plugins by calling their dispose hooks
 */
export async function disposeAllPlugins(registry: any, logger?: ILogger): Promise<void> {
  const log = logger ?? platform.logger;
  const manifests = registry.listManifests();
  const disposePromises: Promise<void>[] = [];

  for (const cmd of manifests) {
    const disposeHook = (cmd as any)._disposeHook;
    if (disposeHook && typeof disposeHook === 'function') {
      disposePromises.push(
        Promise.resolve(disposeHook({
          registry,
          command: cmd,
        })).catch((err: any) => {
          log.warn(`Dispose hook failed for ${cmd.manifest.id}: ${err.message}`);
        })
      );
    }
  }

  await Promise.allSettled(disposePromises);
}
