/**
 * @module @kb-labs/core-sandbox/diagnostics/module-tracker
 * Tracks module loading to identify which module causes crashes
 */

import Module from 'node:module';

export interface ModuleLoadEntry {
  name: string;
  timestamp: number;
  duration: number;
  parent?: string;
}

export class ModuleTracker {
  private loadHistory: ModuleLoadEntry[] = [];
  private currentLoading: { name: string; start: number; parent?: string } | null = null;
  private maxHistory: number;
  private slowModuleThreshold: number;
  private verbose: boolean;

  constructor(options: { maxHistory?: number; slowModuleThreshold?: number; verbose?: boolean } = {}) {
    this.maxHistory = options.maxHistory || 100;
    this.slowModuleThreshold = options.slowModuleThreshold || 100; // ms
    this.verbose = options.verbose ?? false;
  }

  /**
   * Start tracking module loads by proxying Module._load
   */
  start(): void {
    const originalLoad = (Module as any)._load as (request: string, parent: any, isMain: boolean) => any;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    // @ts-expect-error - Monkey-patch Module._load for tracking
    Module._load = function (request: string, parent: any, isMain: boolean) {
      const start = performance.now();
      const parentName = parent?.filename || parent?.id || '<anonymous>';

      self.currentLoading = {
        name: request,
        start,
        parent: parentName,
      };

      try {
        const result = originalLoad.call(this, request, parent, isMain);
        const duration = performance.now() - start;

        const entry: ModuleLoadEntry = {
          name: request,
          timestamp: Date.now(),
          duration,
          parent: parentName,
        };

        self.loadHistory.push(entry);

        // Keep only last N entries
        if (self.loadHistory.length > self.maxHistory) {
          self.loadHistory.shift();
        }

        // Warn about slow module loads
        if (duration > self.slowModuleThreshold && self.verbose) {
          console.warn(`[MODULE-TRACKER] Slow module load: ${request} (${duration.toFixed(1)}ms)`);
        }

        self.currentLoading = null;
        return result;
      } catch (error) {
        // If crash happens during module load, we know which module
        if (self.verbose) {
          console.error(`[MODULE-TRACKER] Failed to load: ${request}`, error);
        }
        self.currentLoading = null;
        throw error;
      }
    };
  }

  /**
   * Get the last N loaded modules
   */
  getLast(count: number = 10): ModuleLoadEntry[] {
    return this.loadHistory.slice(-count);
  }

  /**
   * Get full loading timeline
   */
  getTimeline(): ModuleLoadEntry[] {
    return [...this.loadHistory];
  }

  /**
   * Get currently loading module (if any)
   */
  getCurrentlyLoading(): { name: string; start: number; parent?: string } | null {
    return this.currentLoading;
  }

  /**
   * Get slow module loads (above threshold)
   */
  getSlowModules(): ModuleLoadEntry[] {
    return this.loadHistory.filter(entry => entry.duration > this.slowModuleThreshold);
  }

  /**
   * Get total module load time
   */
  getTotalLoadTime(): number {
    return this.loadHistory.reduce((sum, entry) => sum + entry.duration, 0);
  }

  /**
   * Get diagnostic summary
   */
  getSummary() {
    const slowModules = this.getSlowModules();
    const totalTime = this.getTotalLoadTime();

    return {
      totalModules: this.loadHistory.length,
      totalLoadTime: totalTime,
      slowModules: slowModules.length,
      slowModulesList: slowModules.map(m => `${m.name} (${m.duration.toFixed(1)}ms)`),
      currentlyLoading: this.currentLoading?.name || null,
    };
  }
}
