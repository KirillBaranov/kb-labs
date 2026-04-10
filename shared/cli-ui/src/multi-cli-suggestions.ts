/**
 * Multi-CLI suggestions system
 * Supports multiple CLI packages with their own manifests
 */

import { 
  createCommandRegistry, 
  generateDevlinkSuggestions,
  type CommandSuggestion,
  type CommandRegistry 
} from './command-suggestions';
import { 
  extractCommandIds, 
  generateGroupSuggestions,
  type CommandManifest 
} from './manifest-parser';

export interface MultiCLIContext {
  warningCodes: Set<string>;
  [key: string]: any;
}

export interface CLIPackage {
  name: string;
  group: string;
  commands: CommandManifest[];
  priority: number; // Higher priority = more important suggestions
}

/**
 * Multi-CLI suggestions manager
 */
export class MultiCLISuggestions {
  private packages: Map<string, CLIPackage> = new Map();
  private globalRegistry: CommandRegistry | null = null;

  /**
   * Register a CLI package
   */
  registerPackage(pkg: CLIPackage): void {
    this.packages.set(pkg.name, pkg);
    this.globalRegistry = null; // Invalidate cache
  }

  /**
   * Get or create global command registry
   */
  private getGlobalRegistry(): CommandRegistry {
    if (this.globalRegistry) {
      return this.globalRegistry;
    }

    const allCommands: string[] = [];
    for (const pkg of this.packages.values()) {
      allCommands.push(...extractCommandIds(pkg.commands));
    }

    this.globalRegistry = createCommandRegistry(allCommands);
    return this.globalRegistry;
  }

  /**
   * Generate suggestions for a specific group
   */
  generateGroupSuggestions(
    group: string, 
    context: MultiCLIContext
  ): CommandSuggestion[] {
    const suggestions: CommandSuggestion[] = [];
    const registry = this.getGlobalRegistry();

    // Find packages for this group
    const groupPackages = Array.from(this.packages.values())
      .filter(pkg => pkg.group === group)
      .sort((a, b) => b.priority - a.priority);

    for (const pkg of groupPackages) {
      const groupSuggestions = generateGroupSuggestions(
        pkg.commands, 
        group, 
        context.warningCodes, 
        context
      );

      // Convert to CommandSuggestion format and validate
      for (const suggestion of groupSuggestions) {
        if (registry.commands.has(suggestion.command.replace('kb ', '').replace(' ', ':'))) {
          suggestions.push({
            id: suggestion.id,
            command: suggestion.command,
            args: suggestion.args,
            description: suggestion.description,
            impact: suggestion.impact,
            when: suggestion.when,
            available: true
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Generate all suggestions across all packages
   */
  generateAllSuggestions(context: MultiCLIContext): CommandSuggestion[] {
    const suggestions: CommandSuggestion[] = [];
    const registry = this.getGlobalRegistry();

    // Special handling for devlink (highest priority)
    if (this.packages.has('devlink')) {
      const devlinkSuggestions = generateDevlinkSuggestions(
        context.warningCodes, 
        { undo: context.undo }, 
        registry
      );
      suggestions.push(...devlinkSuggestions);
    }

    // Generate suggestions for other groups
    const groups = new Set<string>();
    for (const pkg of this.packages.values()) {
      groups.add(pkg.group);
    }

    for (const group of groups) {
      if (group !== 'devlink') { // Skip devlink as it's handled above
        const groupSuggestions = this.generateGroupSuggestions(group, context);
        suggestions.push(...groupSuggestions);
      }
    }

    return suggestions;
  }

  /**
   * Get available commands for a group
   */
  getAvailableCommands(group: string): string[] {
    const groupPackages = Array.from(this.packages.values())
      .filter(pkg => pkg.group === group);
    
    const commands: string[] = [];
    for (const pkg of groupPackages) {
      commands.push(...extractCommandIds(pkg.commands));
    }
    
    return commands;
  }

  /**
   * Get all registered packages
   */
  getPackages(): CLIPackage[] {
    return Array.from(this.packages.values());
  }
}

