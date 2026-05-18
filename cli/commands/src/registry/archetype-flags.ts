import type { FlagDefinition } from './types.js';

// ─── Standard flags per archetype ────────────────────────────────────────────

const outputFlag: FlagDefinition  = { name: 'output',  type: 'string',  choices: ['json', 'table', 'csv'], description: 'Output format' };
const dryRunFlag: FlagDefinition  = { name: 'dry-run', type: 'boolean', description: 'Show what would happen without executing' };
const yesFlag: FlagDefinition     = { name: 'yes',     type: 'boolean', alias: 'y', description: 'Skip confirmation prompts' };
const waitFlag: FlagDefinition    = { name: 'wait',    type: 'boolean', description: 'Block until execution completes' };
const watchFlag: FlagDefinition   = { name: 'watch',   type: 'boolean', description: 'Stream events as NDJSON' };
const timeoutFlag: FlagDefinition = { name: 'timeout', type: 'string',  description: 'Max wait time (e.g. 30s, 5m)' };
const limitFlag: FlagDefinition   = { name: 'limit',   type: 'number',  description: 'Max results to return' };
const offsetFlag: FlagDefinition  = { name: 'offset',  type: 'number',  description: 'Offset for pagination' };
const formatFlag: FlagDefinition  = { name: 'format',  type: 'string',  choices: ['json', 'text', 'md'], description: 'Output format' };
const streamFlag: FlagDefinition  = { name: 'stream',  type: 'boolean', description: 'Stream output progressively' };

/** Injected into every command that declares operationType — visible in --help */
export const schemaFlag: FlagDefinition = {
  name: 'schema',
  type: 'boolean',
  description: 'Output JSON Schema for this command (flags, types, examples)',
};

export const ARCHETYPE_FLAGS: Record<string, FlagDefinition[]> = {
  read:    [outputFlag, limitFlag, offsetFlag],
  mutate:  [outputFlag, dryRunFlag, yesFlag],
  execute: [outputFlag, waitFlag, watchFlag, timeoutFlag, yesFlag],
  analyze: [outputFlag, formatFlag, streamFlag],
};

/**
 * Returns archetype flags that are not already declared by the plugin author.
 * Existing flags always win — the archetype never overwrites.
 */
export function getArchetypeFlags(
  operationType: string,
  existing: FlagDefinition[] = [],
): FlagDefinition[] {
  const toInject = ARCHETYPE_FLAGS[operationType] ?? [];
  const existingNames = new Set(existing.map(f => f.name));
  return toInject.filter(f => !existingNames.has(f.name));
}
