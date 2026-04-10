/**
 * @module @kb-labs/cli-runtime/lifecycle/lifecycle-manager
 * Plugin lifecycle management
 */

import type { ManifestV3 } from '@kb-labs/plugin-contracts';

export interface IManifestProvider {
  getManifest(pluginId: string): ManifestV3 | null;
}

/**
 * Plugin lifecycle interface
 */
export interface PluginLifecycle {
  onLoad?: (ctx: CliContext) => Promise<void>;
  onUnload?: (ctx: CliContext) => Promise<void>;
  onEnable?: (ctx: CliContext) => Promise<void>;
  onDisable?: (ctx: CliContext) => Promise<void>;
}

/**
 * Execution limits
 */
export interface ExecutionLimits {
  lifecycleTimeoutMs: number; // default: 5000
  middlewareTimeoutMs: number; // default: 2000
  discoveryTimeoutMs: number; // default: 10000
}

/**
 * CLI Context (simplified for lifecycle)
 */
export interface CliContext {
  logger?: {
    debug(msg: string, meta?: object): void;
    info(msg: string, meta?: object): void;
    warn(msg: string, meta?: object): void;
    error(msg: string, meta?: object): void;
  };
  [key: string]: unknown;
}

/**
 * Lifecycle manager
 */
export class LifecycleManager {
  private loadedHooks: Map<string, PluginLifecycle> = new Map();

  constructor(
    private registry: IManifestProvider,
    private context: CliContext,
    private limits: ExecutionLimits,
  ) {}

  /**
   * Invoke onLoad hook
   */
  async invokeLoad(pluginId: string): Promise<void> {
    const manifest = this.registry.getManifest(pluginId);
    if (!manifest?.lifecycle?.onLoad) {
      return;
    }

    try {
      const lifecycle = await this.loadLifecycle(
        pluginId,
        manifest.lifecycle.onLoad,
      );
      if (lifecycle.onLoad) {
        await this.withTimeout(
          lifecycle.onLoad(this.context),
          this.limits.lifecycleTimeoutMs,
          `onLoad hook for ${pluginId}`,
        );
        this.loadedHooks.set(pluginId, lifecycle);
      }
    } catch (error) {
      this.context.logger?.error(`Failed to invoke onLoad for ${pluginId}`, {
        error,
      });
    }
  }

  /**
   * Invoke onUnload hook
   */
  async invokeUnload(pluginId: string): Promise<void> {
    const lifecycle = this.loadedHooks.get(pluginId);
    if (!lifecycle?.onUnload) {
      return;
    }

    try {
      await this.withTimeout(
        lifecycle.onUnload(this.context),
        this.limits.lifecycleTimeoutMs,
        `onUnload hook for ${pluginId}`,
      );
    } catch (error) {
      this.context.logger?.error(`Failed to invoke onUnload for ${pluginId}`, {
        error,
      });
    } finally {
      this.loadedHooks.delete(pluginId);
    }
  }

  /**
   * Invoke onEnable hook
   */
  async invokeEnable(pluginId: string): Promise<void> {
    const lifecycle = this.loadedHooks.get(pluginId);
    if (!lifecycle?.onEnable) {
      return;
    }

    try {
      await this.withTimeout(
        lifecycle.onEnable(this.context),
        this.limits.lifecycleTimeoutMs,
        `onEnable hook for ${pluginId}`,
      );
    } catch (error) {
      this.context.logger?.error(`Failed to invoke onEnable for ${pluginId}`, {
        error,
      });
    }
  }

  /**
   * Invoke onDisable hook
   */
  async invokeDisable(pluginId: string): Promise<void> {
    const lifecycle = this.loadedHooks.get(pluginId);
    if (!lifecycle?.onDisable) {
      return;
    }

    try {
      await this.withTimeout(
        lifecycle.onDisable(this.context),
        this.limits.lifecycleTimeoutMs,
        `onDisable hook for ${pluginId}`,
      );
    } catch (error) {
      this.context.logger?.error(`Failed to invoke onDisable for ${pluginId}`, {
        error,
      });
    }
  }

  /**
   * Shutdown all plugins gracefully
   */
  async shutdownAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const pluginId of this.loadedHooks.keys()) {
      promises.push(this.invokeUnload(pluginId));
    }

    await Promise.allSettled(promises);
    this.loadedHooks.clear();
  }

  /**
   * Load lifecycle from path
   */
  private async loadLifecycle(
    pluginId: string,
    lifecyclePath: string,
  ): Promise<PluginLifecycle> {
    // Parse path: './lifecycle.js#onLoad'
    const [file, _exportName] = lifecyclePath.split("#");
    if (!file) {
      throw new Error(`Invalid lifecycle path: ${lifecyclePath}`);
    }

    // TODO: Resolve actual file path relative to plugin
    // For now, return empty lifecycle
    return {};
  }

  /**
   * Execute with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Timeout: ${label} exceeded ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  }
}
