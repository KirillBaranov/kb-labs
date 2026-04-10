/**
 * Automatic CLI discovery and registration
 */

import { MultiCLISuggestions, type CLIPackage } from './multi-cli-suggestions';
import { extractCommandIds } from './manifest-parser';

export interface CLIDiscoveryOptions {
  /**
   * Root directory to search for CLI packages
   */
  rootDir?: string;
  
  /**
   * Whether to include dev dependencies
   */
  includeDev?: boolean;
  
  /**
   * Custom package patterns to search for
   */
  patterns?: string[];
}

/**
 * Discover CLI packages in a workspace
 */
export async function discoverCLIPackages(
  options: CLIDiscoveryOptions = {}
): Promise<CLIPackage[]> {
  const packages: CLIPackage[] = [];
  const rootDir = options.rootDir || process.cwd();
  
  // Common patterns for CLI packages
  const patterns = options.patterns || [
    '**/cli.manifest.ts',
    '**/cli.manifest.js',
    '**/src/cli.manifest.ts',
    '**/src/cli.manifest.js'
  ];

  try {
    const { glob } = await import('glob');
    
    for (const pattern of patterns) {
      const files = await glob(pattern, { cwd: rootDir });
      
      for (const file of files) {
        try {
          const manifestPath = `${rootDir}/${file}`;
          const manifest = await import(manifestPath);
          
          if (manifest.commands && Array.isArray(manifest.commands)) {
            // Extract package info from path
            const pathParts = file.split('/');
            const packageName = pathParts[pathParts.length - 3] || 'unknown';
            const group = packageName.replace(/-cli$/, '').replace(/^kb-labs-/, '');
            
            // Determine priority based on package type
            let priority = 50;
            if (group === 'devlink') {priority = 100;}
            else if (group === 'mind') {priority = 80;}
            else if (group === 'tox') {priority = 70;}
            else if (group === 'profiles') {priority = 60;}
            else if (group === 'ai-review') {priority = 50;}
            
            packages.push({
              name: packageName,
              group,
              commands: manifest.commands,
              priority
            });
          }
        } catch (error) {
          // Skip invalid manifests
          console.warn(`Failed to load manifest: ${file}`, error);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to discover CLI packages:', error);
  }

  return packages;
}

/**
 * Create a multi-CLI suggestions instance with auto-discovery
 */
export async function createAutoDiscoveredCLISuggestions(
  options: CLIDiscoveryOptions = {}
): Promise<MultiCLISuggestions> {
  const manager = new MultiCLISuggestions();
  const packages = await discoverCLIPackages(options);
  
  for (const pkg of packages) {
    manager.registerPackage(pkg);
  }
  
  return manager;
}

/**
 * Get command registry for a specific workspace
 */
export async function getWorkspaceCommandRegistry(
  rootDir: string = process.cwd()
): Promise<{ registry: any; packages: CLIPackage[] }> {
  const packages = await discoverCLIPackages({ rootDir });
  const allCommands: string[] = [];
  
  for (const pkg of packages) {
    allCommands.push(...extractCommandIds(pkg.commands));
  }
  
  const { createCommandRegistry } = await import('./command-suggestions');
  const registry = createCommandRegistry(allCommands);
  
  return { registry, packages };
}
