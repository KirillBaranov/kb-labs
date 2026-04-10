/**
 * @module @kb-labs/core-sandbox/runner/initialization/diagnostics-setup
 * Initialize diagnostic tools for subprocess execution
 */

import { ModuleTracker } from '../../diagnostics/module-tracker';
import { HeapMonitor } from '../../diagnostics/heap-monitor';

export interface DiagnosticsSetupOptions {
  moduleTracker?: {
    maxHistory?: number;
    slowModuleThreshold?: number;
    verbose?: boolean;
  };
  heapMonitor?: {
    thresholds?: number[];
    snapshotDir?: string;
    interval?: number;
    enabled?: boolean;
  };
}

export interface DiagnosticsContext {
  moduleTracker: ModuleTracker;
  heapMonitor: HeapMonitor;
}

/**
 * Initialize diagnostic tools for monitoring subprocess execution
 *
 * This sets up:
 * - ModuleTracker: Tracks which modules are being loaded to identify crash location
 * - HeapMonitor: Automatically generates heap snapshots at memory thresholds
 */
export function initializeDiagnostics(options: DiagnosticsSetupOptions = {}): DiagnosticsContext {
  const {
    moduleTracker: moduleTrackerOpts = {},
    heapMonitor: heapMonitorOpts = {},
  } = options;

  // Setup module load tracking
  const moduleTracker = new ModuleTracker({
    maxHistory: moduleTrackerOpts.maxHistory ?? 100,
    slowModuleThreshold: moduleTrackerOpts.slowModuleThreshold ?? 100, // Warn if module takes >100ms to load
    verbose: moduleTrackerOpts.verbose ?? false,
  });

  // Start tracking immediately
  moduleTracker.start();

  // Setup heap monitoring with automatic snapshots
  const heapMonitor = new HeapMonitor({
    thresholds: heapMonitorOpts.thresholds ?? [50, 70, 90], // Generate snapshots at 50%, 70%, 90% heap usage
    snapshotDir: heapMonitorOpts.snapshotDir ?? process.env.KB_CRASH_DIR ?? '/tmp',
    interval: heapMonitorOpts.interval ?? 1000, // Check every second
    verbose: false, // Don't spam console
  });

  // Start heap monitoring (enabled by default, can disable with KB_HEAP_MONITOR=false)
  const heapMonitorEnabled = heapMonitorOpts.enabled ?? process.env.KB_HEAP_MONITOR !== 'false';
  if (heapMonitorEnabled) {
    heapMonitor.start();
  }

  return {
    moduleTracker,
    heapMonitor,
  };
}
