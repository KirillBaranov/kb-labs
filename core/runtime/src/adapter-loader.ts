/**
 * @module @kb-labs/core-runtime/adapter-loader
 * Adapter dependency resolution and loading with topological sort.
 *
 * Implements ADR-0043: Adapter Manifest System
 */

import type { AdapterManifest, AdapterDependency } from '@kb-labs/core-platform';

/**
 * Adapter configuration from kb.config.json
 */
export interface AdapterConfig {
  /** Package path (e.g., "@kb-labs/adapters-pino") */
  module: string;
  /** Adapter-specific configuration */
  config?: unknown;
}

/**
 * Loaded adapter module with manifest and factory
 */
export interface LoadedAdapterModule {
  /** Adapter manifest */
  manifest: AdapterManifest;
  /** Factory function to create adapter instance */
  createAdapter: (config: unknown, deps: Record<string, unknown>) => unknown | Promise<unknown>;
}

/**
 * Dependency graph node
 */
interface DependencyGraphNode {
  /** Adapter name (config key) */
  name: string;
  /** Adapter manifest */
  manifest: AdapterManifest;
  /** Loaded module */
  module: LoadedAdapterModule;
  /** Adapter configuration */
  config: unknown;
  /** Required dependencies (adapter names) */
  requiredDeps: string[];
  /** Optional dependencies (adapter names) */
  optionalDeps: string[];
  /** Incoming edge count (for Kahn's algorithm) */
  inDegree: number;
}

/**
 * Dependency graph for topological sort
 */
export class DependencyGraph {
  private nodes = new Map<string, DependencyGraphNode>();
  private edges = new Map<string, Set<string>>(); // from -> [to...]

  /**
   * Add node to graph
   */
  addNode(node: DependencyGraphNode): void {
    this.nodes.set(node.name, node);
    if (!this.edges.has(node.name)) {
      this.edges.set(node.name, new Set());
    }
  }

  /**
   * Add edge from dependency to dependent.
   * In topological sort, edge A -> B means A must come before B.
   * For adapters: db -> logPersistence means db must load before logPersistence.
   */
  addEdge(from: string, to: string): void {
    if (!this.edges.has(from)) {
      this.edges.set(from, new Set());
    }
    this.edges.get(from)!.add(to);

    // Increment in-degree of dependent node (target)
    const node = this.nodes.get(to);
    if (node) {
      node.inDegree++;
    }
  }

  /**
   * Get node by name
   */
  getNode(name: string): DependencyGraphNode | undefined {
    return this.nodes.get(name);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): DependencyGraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get dependencies of a node
   */
  getDependencies(name: string): string[] {
    return Array.from(this.edges.get(name) ?? []);
  }

  /**
   * Topological sort using Kahn's algorithm.
   * Returns nodes in dependency order (dependencies before dependents).
   *
   * @throws Error if circular dependency detected
   */
  topologicalSort(): DependencyGraphNode[] {
    // Copy in-degrees (Kahn's algorithm mutates them)
    const inDegrees = new Map<string, number>();
    for (const node of this.nodes.values()) {
      inDegrees.set(node.name, node.inDegree);
    }

    // Queue of nodes with no incoming edges
    const queue: string[] = [];
    for (const [name, degree] of inDegrees.entries()) {
      if (degree === 0) {
        queue.push(name);
      }
    }

    const sorted: DependencyGraphNode[] = [];

    while (queue.length > 0) {
      const currentName = queue.shift()!;
      const currentNode = this.nodes.get(currentName)!;
      sorted.push(currentNode);

      // For each dependency of current node
      const deps = this.getDependencies(currentName);
      for (const depName of deps) {
        const depDegree = inDegrees.get(depName)!;
        inDegrees.set(depName, depDegree - 1);

        if (depDegree - 1 === 0) {
          queue.push(depName);
        }
      }
    }

    // If not all nodes processed, there's a cycle
    if (sorted.length !== this.nodes.size) {
      const remaining = Array.from(this.nodes.keys()).filter(
        (name) => !sorted.some((node) => node.name === name)
      );
      throw new Error(
        `Circular dependency detected in adapters: ${remaining.join(', ')}`
      );
    }

    return sorted;
  }
}

/**
 * Adapter loader with dependency resolution.
 *
 * Features:
 * - Topological sort for correct load order
 * - Circular dependency detection
 * - Extension connection after all adapters loaded
 * - Support for optional dependencies
 */
export class AdapterLoader {
  /**
   * Create rich missing-dependency error with runtime-token guidance.
   */
  private createMissingDependencyError(
    nodeName: string,
    depToken: string,
    graph: DependencyGraph
  ): Error {
    const nodes = graph.getAllNodes();
    const configuredTokens = nodes.map((n) => n.name);
    const matchingManifestIds = nodes
      .filter((n) => n.manifest.id === depToken)
      .map((n) => n.name);

    let message =
      `Adapter "${nodeName}" requires adapter "${depToken}" but it's not configured. ` +
      `Dependencies must reference runtime adapter tokens (config keys), not manifest.id.`;

    if (matchingManifestIds.length > 0) {
      message +=
        ` Token "${depToken}" matches manifest.id of configured adapter token(s): ` +
        `${matchingManifestIds.join(', ')}.`;
    }

    message += ` Configured tokens: ${configuredTokens.join(', ') || '(none)'}.`;
    return new Error(message);
  }

  /**
   * Build dependency graph from adapter configurations.
   *
   * @param configs - Adapter configurations from kb.config.json
   * @param loadModule - Function to load adapter module (for testing/mocking)
   * @returns Dependency graph
   */
  async buildDependencyGraph(
    configs: Record<string, AdapterConfig>,
    loadModule: (modulePath: string) => Promise<LoadedAdapterModule>
  ): Promise<DependencyGraph> {
    const graph = new DependencyGraph();

    // Step 1: Load all modules and create nodes
    for (const [name, config] of Object.entries(configs)) {
      const module = await loadModule(config.module);

      // Parse dependencies from manifest
      const requiredDeps = this.parseDependencies(module.manifest.requires?.adapters ?? []);
      const optionalDeps = module.manifest.optional?.adapters ?? [];

      graph.addNode({
        name,
        manifest: module.manifest,
        module,
        config: config.config,
        requiredDeps,
        optionalDeps,
        inDegree: 0, // Will be updated when edges are added
      });
    }

    // Step 2: Add edges (dependencies)
    for (const node of graph.getAllNodes()) {
      // Add edges for required dependencies
      for (const depId of node.requiredDeps) {
        const depNode = graph.getNode(depId);
        if (!depNode) {
          throw this.createMissingDependencyError(node.name, depId, graph);
        }
        // Edge from dependency to dependent (dependency must load first)
        // db -> logPersistence means db loads before logPersistence
        graph.addEdge(depId, node.name);
      }

      // Add edges for optional dependencies (if present)
      for (const depId of node.optionalDeps) {
        const depNode = graph.getNode(depId);
        if (depNode) {
          // Only add edge if optional dep exists
          graph.addEdge(depId, node.name);
        }
        // If optional dep missing, skip (no error)
      }
    }

    return graph;
  }

  /**
   * Parse adapter dependencies from manifest.
   * Handles both short form (string[]) and long form ({ id, alias }[]).
   */
  private parseDependencies(deps: AdapterDependency[]): string[] {
    return deps.map((dep) => {
      if (typeof dep === 'string') {
        return dep;
      }
      return dep.id;
    });
  }

  /**
   * Get dependency aliases for factory function.
   * Maps dependency IDs to their aliases (or ID if no alias).
   */
  private getDependencyAliases(
    manifest: AdapterManifest
  ): Map<string, string> {
    const aliases = new Map<string, string>();

    const deps = manifest.requires?.adapters ?? [];
    for (const dep of deps) {
      if (typeof dep === 'string') {
        aliases.set(dep, dep); // No alias, use ID
      } else {
        aliases.set(dep.id, dep.alias ?? dep.id);
      }
    }

    return aliases;
  }

  /**
   * Load adapters in dependency order.
   *
   * @param configs - Adapter configurations
   * @param loadModule - Function to load adapter module
   * @returns Map of adapter name to instance
   */
  async loadAdapters(
    configs: Record<string, AdapterConfig>,
    loadModule: (modulePath: string) => Promise<LoadedAdapterModule>
  ): Promise<Map<string, unknown>> {
    // Step 1: Build dependency graph
    const graph = await this.buildDependencyGraph(configs, loadModule);

    // Step 2: Topological sort
    const sorted = graph.topologicalSort();

    // Step 3: Load adapters in dependency order
    const adapters = new Map<string, unknown>();

    for (const node of sorted) {
      // Build deps object for factory function
      const deps: Record<string, unknown> = {};

      // Get dependency aliases
      const aliases = this.getDependencyAliases(node.manifest);

      // Add required dependencies
      for (const depId of node.requiredDeps) {
        const depInstance = adapters.get(depId);
        if (!depInstance) {
          throw new Error(
            `Internal error: Required dependency "${depId}" not loaded before "${node.name}"`
          );
        }
        const alias = aliases.get(depId) ?? depId;
        deps[alias] = depInstance;
      }

      // Add optional dependencies (if present)
      for (const depId of node.optionalDeps) {
        const depInstance = adapters.get(depId);
        if (depInstance) {
          const alias = aliases.get(depId) ?? depId;
          deps[alias] = depInstance;
        }
        // If optional dep missing, skip
      }

      // Create adapter instance
      const instance = await node.module.createAdapter(node.config, deps);
      adapters.set(node.name, instance);
    }

    return adapters;
  }

  private validateExtensionConnection(
    target: unknown,
    targetName: string,
    hook: string,
    method: string,
    instance: unknown
  ): string | null {
    if (!target) { return `target adapter "${targetName}" not found`; }
    if (typeof (target as any)[hook] !== 'function') { return `target "${targetName}" has no method "${hook}"`; }
    if (typeof (instance as any)[method] !== 'function') { return `extension has no method "${method}"`; }
    return null;
  }

  /**
   * Connect extensions to core adapters.
   * Called after all adapters are loaded.
   *
   * Extensions are sorted by priority (higher first), then by registration order.
   *
   * @param adapters - Map of adapter name to instance
   * @param graph - Dependency graph with manifests
   */
  connectExtensions(
    adapters: Map<string, unknown>,
    graph: DependencyGraph
  ): void {
    // Collect all extensions
    const extensions: Array<{
      name: string;
      manifest: AdapterManifest;
      instance: unknown;
      priority: number;
    }> = [];

    for (const node of graph.getAllNodes()) {
      if (node.manifest.extends) {
        const instance = adapters.get(node.name);
        if (!instance) {continue;}

        extensions.push({
          name: node.name,
          manifest: node.manifest,
          instance,
          priority: node.manifest.extends.priority ?? 0,
        });
      }
    }

    // Sort by priority (higher first), then by name (stable sort)
    extensions.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.name.localeCompare(b.name); // Alphabetical for same priority
    });

    // Connect each extension
    for (const ext of extensions) {
      const { adapter: targetName, hook, method } = ext.manifest.extends!;
      const target = adapters.get(targetName);

      const problem = this.validateExtensionConnection(target, targetName, hook, method, ext.instance);
      if (problem) {
        console.warn(`[AdapterLoader] Extension "${ext.name}" cannot connect: ${problem}`);
        continue;
      }

      try {
        const extensionMethod = (ext.instance as any)[method].bind(ext.instance);
        (target as any)[hook](extensionMethod);

        if (process.env.DEBUG || process.env.KB_LOG_LEVEL === 'debug') {
          process.stderr.write(
            `[AdapterLoader] Connected extension "${ext.name}" to "${targetName}.${hook}" (priority: ${ext.priority})\n`
          );
        }
      } catch (error) {
        console.error(`[AdapterLoader] Failed to connect extension "${ext.name}":`, error);
      }
    }
  }
}
