/**
 * @module @kb-labs/rest-api-app/bootstrap
 * Server bootstrap and startup
 */

import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { createServer } from './server';
import { findRepoRoot } from '@kb-labs/core-sys';
import { createRegistry, type IEntityRegistry } from '@kb-labs/core-registry';
import { platform, createServiceBootstrap, loadEnvFromRoot, getPlatformRoot } from '@kb-labs/core-runtime';
import type { IServiceTransport } from '@kb-labs/core-platform';
import { makeAssemblyHook } from '@kb-labs/plugin-runtime';
import { getListenOptions } from '@kb-labs/shared-http';
import { SystemMetricsCollector } from './daemon/metrics';
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
 * Find the monorepo root: the NEAREST ancestor of `startDir` that owns a
 * `pnpm-workspace.yaml`.
 *
 * "Nearest" is deliberate. In a normal checkout there is exactly one
 * `pnpm-workspace.yaml` (at the repo root), so nearest == that root. In a git
 * **worktree** nested under the main checkout (e.g.
 * `<main>/.claude/worktrees/<id>/`) BOTH the worktree and the main checkout
 * have a `pnpm-workspace.yaml`; the process is running in the worktree, so the
 * worktree is the correct root. The previous implementation preferred the
 * *topmost* match (and gated on a stale `kb-*` literal that no longer appears
 * in the workspace globs), which always resolved a nested worktree back to the
 * main checkout — so plugin discovery loaded the main branch's plugins instead
 * of the worktree's. That silently served stale plugin manifests/routes.
 */
export async function findMonorepoRoot(startDir: string): Promise<string> {
  let dir = path.resolve(startDir);
  while (true) {
    const hasWorkspace = await fs
      .access(path.join(dir, 'pnpm-workspace.yaml'))
      .then(() => true)
      .catch(() => false);
    if (hasWorkspace) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  // No pnpm-workspace.yaml anywhere up the tree — fall back to git repo root.
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
  await createServiceBootstrap({ appId: 'rest-api', repoRoot, assemblyHook: makeAssemblyHook() });

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

  // Project root is always the primary source for plugin discovery.
  // In installed mode (platform.dir set), the platform lock fills gaps —
  // but project marketplace.lock wins on conflict (project overrides platform).
  const platformRoot = getPlatformRoot();
  const registryInitStart = performance.now();
  const registry = await createRegistry({
    root: repoRoot,
    platformRoot: platformRoot !== repoRoot ? platformRoot : undefined,
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

  // Bind port from the transport (single declarative network source): rest is a
  // TCP service in the serviceTransport map, so it listens on exactly the port
  // the transport publishes for 'rest' — keeping bind and route consistent
  // (incl. any KB_NET_OFFSET shift). Falls back to config.port when no transport.
  const restTransport = platform.getAdapter<IServiceTransport>('serviceTransport');
  const restAddr = restTransport?.listenAddress?.('rest');
  const listenPort = restAddr && 'port' in restAddr ? restAddr.port : config.port;

  // Start server.
  // Defaults to 0.0.0.0 for compatibility with Docker port-forwarding and dev setups.
  // Set REST_API_HOST=127.0.0.1 to restrict to loopback in environments where
  // all public traffic is routed through the gateway.
  const address = await server.listen(getListenOptions(listenPort, process.env.REST_API_HOST ?? '0.0.0.0'));

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
