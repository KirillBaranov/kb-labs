/**
 * CLI manifest parsing utilities
 */

export interface CommandManifest {
  manifestVersion: string;
  id: string;
  aliases?: string[];
  group: string;
  describe: string;
  longDescription?: string;
  requires?: string[];
  flags?: FlagDefinition[];
  examples?: string[];
  loader: () => Promise<{ run: any }>;
}

export interface FlagDefinition {
  name: string;
  type: 'string' | 'boolean' | 'number' | 'array';
  alias?: string;
  default?: any;
  description?: string;
  choices?: string[];
  required?: boolean;
}

/**
 * Extract command IDs from a manifest
 */
export function extractCommandIds(manifest: CommandManifest[]): string[] {
  return manifest.map(cmd => cmd.id);
}

/**
 * Extract command groups from a manifest
 */
export function extractCommandGroups(manifest: CommandManifest[]): string[] {
  const groups = new Set<string>();
  manifest.forEach(cmd => groups.add(cmd.group));
  return Array.from(groups);
}

/**
 * Find commands by group
 */
export function findCommandsByGroup(manifest: CommandManifest[], group: string): CommandManifest[] {
  return manifest.filter(cmd => cmd.group === group);
}

/**
 * Find command by ID
 */
export function findCommandById(manifest: CommandManifest[], id: string): CommandManifest | undefined {
  return manifest.find(cmd => cmd.id === id);
}

/**
 * Get command info for suggestions
 */
export function getCommandInfo(manifest: CommandManifest[], commandId: string): {
  id: string;
  group: string;
  name: string;
  description: string;
  available: boolean;
} | null {
  const cmd = findCommandById(manifest, commandId);
  if (!cmd) {
    return null;
  }

  const [group, name] = commandId.split(':');
  return {
    id: commandId,
    group: group || 'unknown',
    name: name || commandId,
    description: cmd.describe,
    available: true
  };
}

/**
 * Generate suggestions for a specific group
 */
export function generateGroupSuggestions(
  manifest: CommandManifest[],
  group: string,
  _warningCodes: Set<string>,
  _context: any
): Array<{
  id: string;
  command: string;
  args: string[];
  description: string;
  impact: 'safe' | 'disruptive';
  when: string;
  available: boolean;
}> {
  const groupCommands = findCommandsByGroup(manifest, group);
  const suggestions: Array<{
    id: string;
    command: string;
    args: string[];
    description: string;
    impact: 'safe' | 'disruptive';
    when: string;
    available: boolean;
  }> = [];

  // Generate common suggestions for each group
  for (const cmd of groupCommands) {
    // Basic command suggestion
    suggestions.push({
      id: `${cmd.group.toUpperCase()}_${cmd.id.split(':')[1]?.toUpperCase() || 'UNKNOWN'}`,
      command: `kb ${cmd.group} ${cmd.id.split(':')[1] || ''}`,
      args: [],
      description: cmd.describe,
      impact: 'safe',
      when: 'GENERAL',
      available: true
    });

    // Add specific suggestions based on command type
    if (cmd.id.includes('init')) {
      suggestions.push({
        id: `${cmd.group.toUpperCase()}_INIT_FORCE`,
        command: `kb ${cmd.group} ${cmd.id.split(':')[1] || ''}`,
        args: ['--force'],
        description: `${cmd.describe} (force)`,
        impact: 'disruptive',
        when: 'INIT_FAILED',
        available: true
      });
    }

    if (cmd.id.includes('clean') || cmd.id.includes('reset')) {
      suggestions.push({
        id: `${cmd.group.toUpperCase()}_CLEAN_HARD`,
        command: `kb ${cmd.group} ${cmd.id.split(':')[1] || ''}`,
        args: ['--hard'],
        description: `${cmd.describe} (hard)`,
        impact: 'disruptive',
        when: 'CLEAN_NEEDED',
        available: true
      });
    }
  }

  return suggestions;
}
