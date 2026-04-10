/**
 * @kb-labs/cli-commands/registry
 * Zod schema for command manifest validation
 */

import { z } from 'zod';
import type { CommandManifest } from './types';

// Semver regex approximation (not full semver, but covers most cases)
const semverPattern = /^[\^~]?[\d]+\.[\d]+(\.[\d]+)?(-[\w\.-]+)?(\+[\w\.-]+)?$/;

/**
 * Flag definition schema
 */
const FlagDefinitionSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Flag name must be lowercase alphanumeric with hyphens'),
  type: z.enum(['string', 'boolean', 'number', 'array']),
  alias: z.string().length(1).regex(/^[a-z]$/i, 'Alias must be a single letter').optional(),
  default: z.any().optional(),
  description: z.string().optional(),
  choices: z.array(z.string()).optional(),
  required: z.boolean().optional(),
}).refine(
  (data) => {
    // Choices only allowed for string type
    if (data.choices && data.type !== 'string') {
      return false;
    }
    return true;
  },
  { message: 'Choices are only allowed for string type flags' }
);

/**
 * Engine requirements schema
 */
const EngineSchema = z.object({
  node: z.string().optional(), // e.g., ">=18", "^18.0.0"
  kbCli: z.string().optional(), // e.g., "^1.5.0"
  module: z.enum(['esm', 'cjs']).optional(),
}).optional();

/**
 * Command manifest schema (v1.0)
 * Supports both legacy and new format
 */
export const CommandManifestSchema = z.object({
  manifestVersion: z.literal('1.0'),
  
  // Legacy fields (still supported)
  id: z.string().min(1).regex(/^[a-z0-9-]+:[a-z0-9-]+(?:[:a-z0-9-]+)*$/, 'Command ID must be in format "namespace:command"'),
  aliases: z.array(z.string()).optional(),
  group: z.string().min(1),
  describe: z.string().min(1),
  longDescription: z.string().optional(),
  requires: z.array(z.string()).optional(), // Package names with optional semver
  flags: z.array(FlagDefinitionSchema).optional(),
  examples: z.array(z.string()).optional(),
  loader: z.any(), // Function validation happens at runtime
  
  // New fields (optional for backward compatibility)
  package: z.string().optional(), // Full package name
  namespace: z.string().optional(), // Derived from id if not provided
  engine: EngineSchema,
  permissions: z.array(z.string()).optional(), // e.g., ["fs.read", "git.read", "net.fetch"]
  telemetry: z.enum(['opt-in', 'off']).optional(),
  manifestV2: z.any().optional(), // Full ManifestV3 for sandbox execution

  // Internal flags for auto-generated commands
  isSetup: z.boolean().optional(), // Auto-generated setup command
  isSetupRollback: z.boolean().optional(), // Auto-generated setup rollback command
  pkgRoot: z.string().optional(), // Package root path for handler resolution
}).refine(
  (data) => {
    // IDs are now simple (no namespace prefix), just check namespace matches group
    if (data.namespace && data.group && data.namespace !== data.group) {
      return false;
    }
    return true;
  },
  { message: 'namespace must match group' }
).refine(
  (data) => {
    // Validate requires entries are semver-compatible if they include version
    if (data.requires) {
      for (const req of data.requires) {
        // If it contains @, check if version part is semver-like
        if (req.includes('@')) {
          const parts = req.split('@');
          if (parts.length === 2) {
            const version = parts[1];
            // Allow exact package names without version; try to parse as semver range
            if (version && !semverPattern.test(version) && !version.startsWith('^') && !version.startsWith('~') && !version.match(/^[\^~>=<]?[\d\.]+/)) {
              return false;
            }
          }
        }
      }
    }
    return true;
  },
  { message: 'requires entries must use valid semver ranges' }
);

/**
 * Validate a single command manifest
 */
export function validateManifest(manifest: unknown): { success: true; data: CommandManifest } | { success: false; error: z.ZodError } {
  const result = CommandManifestSchema.safeParse(manifest);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, error: result.error };
}

/**
 * Validate an array of command manifests
 */
export function validateManifests(manifests: unknown[]): { success: true; data: CommandManifest[] } | { success: false; errors: z.ZodError[] } {
  const errors: z.ZodError[] = [];
  const validated: CommandManifest[] = [];
  
  for (let i = 0; i < manifests.length; i++) {
    const result = CommandManifestSchema.safeParse(manifests[i]);
    if (result.success) {
      validated.push(result.data);
    } else {
      const errorWithIndex = new z.ZodError([
        ...result.error.issues.map(issue => ({
          ...issue,
          path: [`[${i}]`, ...issue.path],
        })),
      ]);
      errors.push(errorWithIndex);
    }
  }
  
  if (errors.length === 0) {
    return { success: true, data: validated };
  }
  
  return { success: false, errors };
}

/**
 * Normalize manifest to ensure required fields are set
 */
export function normalizeManifest(manifest: CommandManifest, packageName: string, namespace?: string): CommandManifest {
  const normalized = { ...manifest };
  
  // Ensure namespace/group consistency
  // Priority: explicit namespace > group > package-derived namespace
  if (!normalized.namespace && normalized.group) {
    normalized.namespace = normalized.group;
  } else if (!normalized.namespace && namespace) {
    normalized.namespace = namespace;
  }
  if (!normalized.group && normalized.namespace) {
    normalized.group = normalized.namespace;
  }
  
  // Ensure package name is set
  if (!normalized.package) {
    normalized.package = packageName;
  }
  
  // ID should be simple without group prefix (breaking change)
  // No longer enforcing namespace:command format
  
  return normalized;
}

