/**
 * @kb-labs/cli-commands/registry
 * Zod schema for command manifest validation (path-based, ADR-0015)
 */

import { z } from 'zod';
import type { CommandManifest } from './types';

const semverPattern = /^[\^~]?[\d]+\.[\d]+(\.[\d]+)?(-[\w\.-]+)?(\+[\w\.-]+)?$/;

const FlagDefinitionSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Flag name must be lowercase alphanumeric with hyphens'),
  type: z.enum(['string', 'boolean', 'number', 'array']),
  alias: z.string().length(1).regex(/^[a-z]$/i, 'Alias must be a single letter').optional(),
  default: z.any().optional(),
  description: z.string().optional(),
  choices: z.array(z.string()).optional(),
  required: z.boolean().optional(),
}).refine(
  (data) => !(data.choices && data.type !== 'string'),
  { message: 'Choices are only allowed for string type flags' }
);

const EngineSchema = z.object({
  node: z.string().optional(),
  kbCli: z.string().optional(),
  module: z.enum(['esm', 'cjs']).optional(),
}).optional();

export const CommandManifestSchema = z.object({
  manifestVersion: z.literal('1.0'),
  segments: z.array(z.string().min(1)).min(1),
  id: z.string().min(1),
  group: z.string().min(1),
  subgroup: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  category: z.string().optional(),
  describe: z.string().min(1),
  longDescription: z.string().optional(),
  requires: z.array(z.string()).optional(),
  flags: z.array(FlagDefinitionSchema).optional(),
  examples: z.array(z.string()).optional(),
  loader: z.any(),
  package: z.string().optional(),
  engine: EngineSchema,
  permissions: z.array(z.string()).optional(),
  telemetry: z.enum(['opt-in', 'off']).optional(),
  manifestV2: z.any().optional(),
  pkgRoot: z.string().optional(),
  _synthetic: z.boolean().optional(),
  operationType: z.enum(['read', 'mutate', 'execute', 'analyze']).optional(),
}).refine(
  (data) => {
    if (data.requires) {
      for (const req of data.requires) {
        if (req.includes('@')) {
          const parts = req.split('@');
          if (parts.length === 2) {
            const version = parts[1];
            if (
              version &&
              !semverPattern.test(version) &&
              !version.startsWith('^') &&
              !version.startsWith('~') &&
              !version.match(/^[\^~>=<]?[\d\.]+/)
            ) {
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

export function validateManifest(manifest: unknown): { success: true; data: CommandManifest } | { success: false; error: z.ZodError } {
  const result = CommandManifestSchema.safeParse(manifest);
  if (result.success) {
    return { success: true, data: result.data as CommandManifest };
  }
  return { success: false, error: result.error };
}

export function validateManifests(manifests: unknown[]): { success: true; data: CommandManifest[] } | { success: false; errors: z.ZodError[] } {
  const errors: z.ZodError[] = [];
  const validated: CommandManifest[] = [];

  for (let i = 0; i < manifests.length; i++) {
    const result = CommandManifestSchema.safeParse(manifests[i]);
    if (result.success) {
      validated.push(result.data as CommandManifest);
    } else {
      errors.push(
        new z.ZodError(
          result.error.issues.map((issue) => ({ ...issue, path: [`[${i}]`, ...issue.path] }))
        )
      );
    }
  }

  return errors.length === 0
    ? { success: true, data: validated }
    : { success: false, errors };
}

/**
 * Normalize manifest: ensure id/group/subgroup are derived from segments,
 * and package name is set.
 */
export function normalizeManifest(manifest: CommandManifest, packageName: string): CommandManifest {
  const segs = manifest.segments;
  return {
    ...manifest,
    id: segs[segs.length - 1] ?? '',
    group: segs[0] ?? '',
    subgroup: segs.length >= 3 ? segs[1] : undefined,
    package: manifest.package ?? packageName,
  };
}
