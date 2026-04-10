/**
 * Dynamic command discovery that loads commands from actual manifests
 */

import type { CommandDiscovery} from './command-discovery';
import { type CommandInfo } from './command-discovery';

export interface ManifestLoader {
  loadManifest(packageName: string): Promise<any[]>;
}

/**
 * Dynamic command discovery that loads commands from manifests
 */
export class DynamicCommandDiscovery implements CommandDiscovery {
  private manifestCache = new Map<string, any[]>();
  private commandCache = new Map<string, CommandInfo>();

  constructor(
    private manifestLoader: ManifestLoader,
    private packageNames: string[]
  ) {}

  async getAvailableCommands(): Promise<string[]> {
    const allCommands: string[] = [];
    
    for (const packageName of this.packageNames) {
      try {
        const manifest = await this.loadManifest(packageName);
        const commands = manifest.map(cmd => cmd.id);
        allCommands.push(...commands);
      } catch (error) {
        console.warn(`Failed to load manifest for ${packageName}:`, error);
      }
    }
    
    return allCommands;
  }

  async getCommandInfo(commandId: string): Promise<CommandInfo | null> {
    // Check cache first
    if (this.commandCache.has(commandId)) {
      return this.commandCache.get(commandId)!;
    }

    // Search through all packages
    for (const packageName of this.packageNames) {
      try {
        const manifest = await this.loadManifest(packageName);
        const command = manifest.find(cmd => cmd.id === commandId);
        
        if (command) {
          const [group, name] = commandId.split(':');
          const info: CommandInfo = {
            id: commandId,
            group: group || 'unknown',
            name: name || commandId,
            description: command.describe || `Execute ${commandId}`,
            available: true
          };
          
          this.commandCache.set(commandId, info);
          return info;
        }
      } catch (error) {
        console.warn(`Failed to load manifest for ${packageName}:`, error);
      }
    }

    return null;
  }

  async isCommandAvailable(commandId: string): Promise<boolean> {
    const info = await this.getCommandInfo(commandId);
    return info !== null;
  }

  private async loadManifest(packageName: string): Promise<any[]> {
    if (this.manifestCache.has(packageName)) {
      return this.manifestCache.get(packageName)!;
    }

    const manifest = await this.manifestLoader.loadManifest(packageName);
    this.manifestCache.set(packageName, manifest);
    return manifest;
  }
}

/**
 * Create a dynamic command discovery for KB Labs packages
 */
export function createKBLabsCommandDiscovery(): DynamicCommandDiscovery {
  const manifestLoader: ManifestLoader = {
    async loadManifest(packageName: string): Promise<any[]> {
      try {
        // Try to load from different possible locations
        const possiblePaths = [
          `@kb-labs/${packageName}/cli.manifest.js`,
          `@kb-labs/${packageName}/dist/cli.manifest.js`,
          `@kb-labs/${packageName}/src/cli.manifest.js`
        ];

        for (const path of possiblePaths) {
          try {
            const manifest = await import(path);
            if (manifest.commands && Array.isArray(manifest.commands)) {
              return manifest.commands;
            }
          } catch {
            // Try next path
            continue;
          }
        }

        throw new Error(`No manifest found for ${packageName}`);
      } catch (error) {
        console.warn(`Failed to load manifest for ${packageName}:`, error);
        return [];
      }
    }
  };

  const packageNames = [
    'devlink-core',
    'mind-cli', 
    'tox-cli',
    'core-cli'
  ];

  return new DynamicCommandDiscovery(manifestLoader, packageNames);
}
