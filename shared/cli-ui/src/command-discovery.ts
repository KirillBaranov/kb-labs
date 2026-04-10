/**
 * Command discovery utilities for CLI systems
 */

export interface CommandInfo {
  id: string;
  group: string;
  name: string;
  description: string;
  available: boolean;
}

/**
 * Discover available commands from CLI manifest or registry
 * This is a generic interface that can be implemented by different CLI systems
 */
export interface CommandDiscovery {
  /**
   * Get all available commands
   */
  getAvailableCommands(): Promise<string[]>;
  
  /**
   * Get command info by ID
   */
  getCommandInfo(commandId: string): Promise<CommandInfo | null>;
  
  /**
   * Check if a command is available
   */
  isCommandAvailable(commandId: string): Promise<boolean>;
}

/**
 * Simple command discovery that works with a predefined list
 * Can be extended to work with actual CLI registries
 */
export class StaticCommandDiscovery implements CommandDiscovery {
  constructor(private commands: string[]) {}

  async getAvailableCommands(): Promise<string[]> {
    return [...this.commands];
  }

  async getCommandInfo(commandId: string): Promise<CommandInfo | null> {
    if (!this.commands.includes(commandId)) {
      return null;
    }

    const [group, name] = commandId.split(':');
    return {
      id: commandId,
      group: group || 'unknown',
      name: name || commandId,
      description: `Execute ${commandId}`,
      available: true
    };
  }

  async isCommandAvailable(commandId: string): Promise<boolean> {
    return this.commands.includes(commandId);
  }
}



/**
 * Create a command discovery instance from a command list
 */
export function createCommandDiscovery(commands: string[]): CommandDiscovery {
  return new StaticCommandDiscovery(commands);
}
