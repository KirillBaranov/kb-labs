/**
 * @module @kb-labs/rest-api-app/bootstrap
 * Server bootstrap and startup
 */

import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { createServer } from './server';
import { findRepoRoot } from '@kb-labs/core-sys';
import { createRegistry, type IEntityRegistry } from '@kb-labs/core-registry';
import { platform, createServiceBootstrap, loadEnvFromRoot, getPlatformRoot } from '@kb-labs/core-runtime';
import { SystemMetricsCollector } from './services/system-metrics-collector';
import { metricsCollector as requestMetricsCollector, restDomainOperationMetrics } from './middleware/metrics.js';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

// Singleton CLI API instance for cleanup
let registryInstance: IEntityRegistry | null = null;

// System metrics collector instance for cleanup
let metricsCollector: SystemMetricsCollector | null = null;

/**
 * Find monorepo root (prefer pnpm-workspace.yaml with kb-* patterns)
 * Looks for the topmost directory with pnpm-workspace.yaml that includes kb-* patterns
 */
async function findMonorepoRoot(startDir: string): Promise<string> {
  let dir = path.resolve(startDir);
  let monorepoRoot: string | null = null;
  
  // First, try to find workspace with kb-* patterns (the actual monorepo root)
  while (true) {
    try {
      const workspacePath = path.join(dir, 'pnpm-workspace.yaml');
      await fs.access(workspacePath);
      const content = await fs.readFile(workspacePath, 'utf-8');
      if (content.includes('kb-*')) {
        // Found the monorepo root with kb-* patterns
        monorepoRoot = dir;
        break;
      }
    } catch {
      // Continue
    }
    
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  
  if (monorepoRoot) {
    return monorepoRoot;
  }
  
  // Fallback: try to find the topmost directory with both .git and pnpm-workspace.yaml
  dir = path.resolve(startDir);
  let foundRoot: string | null = null;
  while (true) {
    try {
      const hasGit = await fs.access(path.join(dir, '.git')).then(() => true).catch(() => false);
      const hasWorkspace = await fs.access(path.join(dir, 'pnpm-workspace.yaml')).then(() => true).catch(() => false);
      
      if (hasGit && hasWorkspace) {
        foundRoot = dir;
      }
    } catch {
      // Continue
    }
    
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  
  if (foundRoot) {
    return foundRoot;
  }
  
  // Final fallback: try to find any pnpm-workspace.yaml
  dir = path.resolve(startDir);
  let topmostWorkspace: string | null = null;
  while (true) {
    try {
      await fs.access(path.join(dir, 'pnpm-workspace.yaml'));
      topmostWorkspace = dir;
    } catch {
      // Continue
    }
    
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  
  if (topmostWorkspace) {
    return topmostWorkspace;
  }
  
  // Final fallback to standard findRepoRoot
  return findRepoRoot(startDir);
}

/**
 * Bootstrap REST API server
 */
export async function bootstrap(cwd: string = process.cwd()): Promise<void> {
  // Detect repo root first so we can load .env before any config reads
  const repoRoot = await findMonorepoRoot(cwd);

  // Load .env early — must happen before loadRestApiConfig() so that
  // KB_REST_* env overrides (port, redis, etc.) are available to the config mapper
  loadEnvFromRoot(repoRoot);

  // Load configuration (envMapper now sees fully-populated process.env)
  const { config, diagnostics } = await loadRestApiConfig(cwd);

  // Initialize platform (adapters from kb.config.json; .env already loaded above)
  await createServiceBootstrap({ appId: 'rest-api', repoRoot });

  // Now we can use platform.logger (configured from kb.config.json)
  const startupRequestId = `rest-startup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const startupTraceId = randomUUID();
  const startupSpanId = randomUUID();
  const bootstrapLogger = platform.logger.child({
    layer: 'rest',
    service: 'bootstrap',
    requestId: startupRequestId,
    reqId: startupRequestId,
    traceId: startupTraceId,
    spanId: startupSpanId,
    invocationId: startupSpanId,
    executionId: startupSpanId,
  });

  if (diagnostics.length > 0) {
    bootstrapLogger.warn('Configuration diagnostics', { diagnosticsCount: diagnostics.length });
    for (const diagnostic of diagnostics) {
      bootstrapLogger.warn('Configuration diagnostic', {
        level: diagnostic.level,
        message: diagnostic.message,
      });
    }
  }

  bootstrapLogger.info('Resolved repo root', { cwd, repoRoot });
  bootstrapLogger.info('Platform adapters initialized');

  // Initialize entity registry
  bootstrapLogger.info('Initializing entity registry');

  const isDevelopment = process.env.NODE_ENV !== 'production';
  const snapshotTTL = isDevelopment
    ? 10 * 60 * 1000  // 10 minutes for development
    : 60 * 60 * 1000; // 1 hour for production

  // In installed mode, plugins live in the platform installation (node_modules of the
  // platform dir) and marketplace.lock is there too. Use platform root when available.
  const registryRoot = getPlatformRoot() ?? repoRoot;
  const registryInitStart = performance.now();
  const registry = await createRegistry({
    root: registryRoot,
    cache: {
      ttlMs: snapshotTTL,
      adapter: platform.cache,
    },
  });
  restDomainOperationMetrics.recordOperation('registry.init', performance.now() - registryInitStart, 'ok');

  const plugins = registry.listPlugins();
  bootstrapLogger.info('Entity registry initialized', {
    pluginsFound: plugins.length,
    pluginIds: plugins.map(p => `${p.id}@${p.version}`),
  });

  registryInstance = registry;

  registry.onChange((diff) => {
    restDomainOperationMetrics.recordOperation('registry.refresh', 0, 'ok');
    bootstrapLogger.info('Registry changed', {
      added: diff.added.length,
      removed: diff.removed.length,
      changed: diff.changed.length,
    });
  });

  const server = await createServer(config, repoRoot, registry);

  // Start system metrics collector
  bootstrapLogger.info('Starting system metrics collector');
  metricsCollector = new SystemMetricsCollector('rest', () => requestMetricsCollector.getActiveRequests());
  await metricsCollector.start(10000, 60000); // Collect every 10s, TTL 60s

  // Start server
  const address = await server.listen({
    port: config.port,
    host: '0.0.0.0',
  });

  bootstrapLogger.info('REST API server listening', { address });

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    bootstrapLogger.warn('Received shutdown signal', { signal });

    // Stop metrics collector
    if (metricsCollector) {
      metricsCollector.stop();
      metricsCollector = null;
    }

    // Dispose CLI API
    if (registryInstance) {
      await registryInstance.dispose();
      registryInstance = null;
    }

    // Shutdown platform (includes ExecutionBackend and all adapters)
    await platform.shutdown();
    bootstrapLogger.info('Platform shutdown complete');

    // Close server
    await server.close();
    bootstrapLogger.info('Server closed');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
