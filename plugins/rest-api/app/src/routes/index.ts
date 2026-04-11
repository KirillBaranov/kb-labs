/**
 * @module @kb-labs/rest-api-app/routes
 * Route registration
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { IEntityRegistry } from '@kb-labs/core-registry';

type RedisStatus = {
  enabled: boolean;
  healthy: boolean;
  roles: { publisher?: string | null; subscriber?: string | null; cache?: string | null };
};
import type { ISQLDatabase } from '@kb-labs/core-platform/adapters';
import { platform } from '@kb-labs/core-runtime';
import { EventHub } from '../events/hub';
import { registerEventRoutes } from './events';
import { registerHealthRoutes } from './health';
import { registerOpenAPIRoutes } from './openapi';
import { registerMetricsRoutes } from './metrics';
import { registerPluginRoutes, registerPluginSnapshotRoutes } from './plugins';
import { registerWorkflowRoutes } from './workflows';
import { registerJobsRoutes } from './jobs';
import { registerCacheRoutes } from './cache';
import { registerObservabilityRoutes } from './observability';
import { registerAnalyticsRoutes } from './analytics';
import { registerAdaptersRoutes } from './adapters';
import { registerLogRoutes } from './logs';
import { registerPlatformRoutes } from './platform';
import { registerAdapterCallRoutes } from './adapter-call';
import { registerDebugRoutes, registerRouteCollector } from './debug-routes';
import type { ReadinessState } from './readiness';
import { isReady, resolveReadinessReason } from './readiness';
import { metricsCollector } from '../middleware/metrics.js';
import { HistoricalMetricsCollector } from '../services/historical-metrics';
import { IncidentStorage } from '../services/incident-storage';
import { IncidentDetector } from '../services/incident-detector';

function normalizeBasePath(basePath?: string): string {
  if (!basePath || basePath === '/') {
    return '';
  }
  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
}

/**
 * Register all routes
 */
export async function registerRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string,
  registry: IEntityRegistry
): Promise<void> {
  // Register route collector hook FIRST, before any routes are registered
  // This allows us to collect all routes for the /routes endpoint
  registerRouteCollector(server);

  const initialSnapshot = registry.snapshot();
  const initialRedisStatus = (registry as any).getRedisStatus?.();
  const initialRedisStates = initialRedisStatus?.roles ?? {
    publisher: null,
    subscriber: null,
    cache: null,
  };

  const registryLoaded =
    initialSnapshot.plugins.length > 0 && !initialSnapshot.partial && !initialSnapshot.stale;

  const readiness: ReadinessState = {
    cliApiInitialized: true,
    registryLoaded,
    registryPartial: initialSnapshot.partial,
    registryStale: initialSnapshot.stale,
    pluginRoutesMounted: false,
    pluginMountInProgress: true,
    pluginRoutesCount: 0,
    pluginRouteErrors: 0,
    pluginRouteFailures: [],
    lastPluginMountTs: null,
    pluginRoutesLastDurationMs: null,
    redisEnabled: initialRedisStatus?.enabled ?? false,
    redisConnected: initialRedisStatus?.healthy ?? true,
    redisStates: initialRedisStates,
  };

  const handleRedisUpdate = (status: RedisStatus) => {
    metricsCollector.recordRedisStatus(status);
    if (!readiness.redisEnabled && status.enabled) {
      platform.logger.info('Redis support enabled', { redis: status });
    }
    if (readiness.redisConnected !== status.healthy) {
      const message = 'Redis health status changed';
      if (status.healthy) {
        platform.logger.info(message, { redis: status });
      } else {
        platform.logger.warn(message, { redis: status });
      }
    }
    const prevStates = readiness.redisStates;
    if (
      prevStates.publisher !== (status.roles.publisher ?? null) ||
      prevStates.subscriber !== (status.roles.subscriber ?? null) ||
      prevStates.cache !== (status.roles.cache ?? null)
    ) {
      platform.logger.info('Redis role state changed', { redis: status.roles });
    }
  };

  if (initialRedisStatus) {
    handleRedisUpdate(initialRedisStatus);
  }
  server.kbReadiness = readiness;

  const eventHub = server.kbEventHub ?? new EventHub();
  server.kbEventHub = eventHub;

  const broadcastState = async (): Promise<void> => {
    const pluginsSnapshot = metricsCollector.getLastPluginMountSnapshot();
    const redisStatus = (registry as any).getRedisStatus?.();
    if (redisStatus) {
      handleRedisUpdate(redisStatus);
      readiness.redisEnabled = redisStatus.enabled;
      readiness.redisConnected = redisStatus.healthy;
      readiness.redisStates = {
        publisher: redisStatus.roles.publisher ?? null,
        subscriber: redisStatus.roles.subscriber ?? null,
        cache: redisStatus.roles.cache ?? null,
      };
    }
    try {
      const snapshot = registry.snapshot();
      eventHub.publish({
        type: 'registry',
        rev: snapshot.rev,
        generatedAt: snapshot.generatedAt,
        partial: snapshot.partial,
        stale: snapshot.stale,
        expiresAt: snapshot.expiresAt ?? null,
        ttlMs: snapshot.ttlMs ?? null,
        checksum: snapshot.checksum ?? undefined,
        checksumAlgorithm: snapshot.checksumAlgorithm,
        previousChecksum: snapshot.previousChecksum ?? null,
      });
    } catch (error) {
      platform.logger.warn('Failed to publish registry snapshot event', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const health = await registry.getSystemHealth();
      const ready = isReady(readiness);
      const reason = resolveReadinessReason(readiness);
      eventHub.publish({
        type: 'health',
        status: health.status,
        ts: health.ts,
        ready,
        reason,
        registryPartial: readiness.registryPartial,
        registryStale: readiness.registryStale,
        registryLoaded: readiness.registryLoaded,
        pluginsMounted: pluginsSnapshot?.succeeded ?? 0,
        pluginsFailed: pluginsSnapshot?.failed ?? 0,
        pluginMountInProgress: readiness.pluginMountInProgress,
        pluginRoutesMounted: readiness.pluginRoutesMounted,
        lastPluginMountTs: readiness.lastPluginMountTs ?? null,
        pluginRoutesLastDurationMs: readiness.pluginRoutesLastDurationMs ?? null,
        redisEnabled: readiness.redisEnabled,
        redisHealthy: readiness.redisConnected,
        redisStates: readiness.redisStates,
      });
    } catch (error) {
      platform.logger.warn('Failed to publish health event', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await broadcastState();

  const runMount = async (): Promise<void> => {
    try {
      await registerPluginRoutes(server, config, repoRoot, registry, readiness);
    } finally {
      await broadcastState();
    }
  };

  // Initial mount - wait for completion before server starts listening
  platform.logger.info('Starting initial plugin route mounting');
  try {
    await runMount();
    platform.logger.info('Plugin route mounting completed');
  } catch (error) {
    platform.logger.error(
      'Plugin route mounting failed',
      error instanceof Error ? error : new Error(String(error))
    );
  }

  // Create a resolved promise for initial mount (already completed)
  let mountPromise = Promise.resolve();

  const scheduleRemount = (): void => {
    // Check if server is already listening - Fastify doesn't allow adding routes after listen()
    // Check both Fastify's listening property and underlying Node.js server
    const isListening = (server as any).listening || 
                       (server.server && (server.server as any).listening);
    
    if (isListening) {
      platform.logger.warn(
        'Cannot remount plugin routes: server is already listening. Restart required.'
      );
      return;
    }

    readiness.pluginMountInProgress = true;
    mountPromise = mountPromise
      .catch(() => void 0)
      .then(async () => {
        // Double-check server is not listening before remount
        const stillListening = (server as any).listening || 
                               (server.server && (server.server as any).listening);
        
        if (stillListening) {
          platform.logger.warn(
            'Cannot remount plugin routes: server started listening during remount. Restart required.'
          );
          return;
        }
        platform.logger.info('Registry change detected, remounting plugin routes');
        await runMount();
      })
      .then(() => {
        platform.logger.info('Plugin route remount completed');
      })
      .catch(error => {
        platform.logger.error(
          'Plugin route remount failed',
          error instanceof Error ? error : new Error(String(error))
        );
      });

    (server as any).kbPluginMountPromise = mountPromise;
  };

  registry.onChange(() => {
    scheduleRemount();
  });

  const basePath = normalizeBasePath(config.basePath);

  await registerHealthRoutes(server, config, repoRoot, registry, readiness);

  await registerOpenAPIRoutes(server, config, repoRoot, registry);

  registerMetricsRoutes(server, config);

  await registerPluginSnapshotRoutes(server, config, registry);

  // Workflow SSE streaming (long-lived connections that can't go through plugin execution)
  // All CRUD operations are handled by the workflow plugin routes (/plugins/workflow/...)
  await registerWorkflowRoutes(server, config);

  // Register jobs management endpoints (scheduled jobs)
  const cronManager = (platform as any).cron ?? null;
  await registerJobsRoutes(server, config, cronManager);

  const platformServices = platform;

  await registerCacheRoutes(server, config, registry);

  // Initialize historical metrics collector
  const historicalCollector = new HistoricalMetricsCollector(
    platformServices.cache,
    {
      intervalMs: 5000, // Collect every 5 seconds
      debug: process.env.NODE_ENV !== 'production',
    },
    platformServices.logger as any
  );

  // Start background collection
  historicalCollector.start();
  platform.logger.info('Historical metrics collector started');

  // Stop collector on server close
  server.addHook('onClose', async () => {
    historicalCollector.stop();
    platform.logger.info('Historical metrics collector stopped');
  });

  // Initialize incident storage (uses logs database, optional)
  let incidentStorage: IncidentStorage | undefined;
  const db = platform.getAdapter<ISQLDatabase>('db');

  if (db) {
    try {
      // Initialize incidents schema
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { dirname, join } = await import('node:path');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const schemaPath = join(__dirname, '..', 'services', 'incident-schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');

      // Execute schema
      if ('exec' in db && typeof (db as any).exec === 'function') {
        await (db as any).exec(schema);
      } else {
        // Fallback: execute statements one by one
        const statements = schema
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
          if (statement) {
            await db.query(statement);
          }
        }
      }

      platform.logger.info('Incidents schema initialized');

      // Create incident storage
      incidentStorage = new IncidentStorage(
        db,
        { debug: process.env.NODE_ENV !== 'production' },
        platformServices.logger as any
      );

      platform.logger.info('Incident storage initialized');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      platform.logger.warn('Failed to initialize incident storage, continuing without it', { error: error.message });
    }
  } else {
    platform.logger.warn('Database adapter (db) not configured — incident storage disabled. Configure db adapter in kb.config.json to enable.');
  }

  // Initialize incident detector for auto-detection (only if storage available)
  if (incidentStorage) {
    const incidentDetector = new IncidentDetector(
      incidentStorage,
      {
        intervalMs: 30000, // Check every 30 seconds
        cooldownMs: 5 * 60 * 1000, // 5 minute cooldown between same incidents
        debug: process.env.NODE_ENV !== 'production',
        thresholds: {
          errorRateWarning: 5,
          errorRateCritical: 10,
          latencyP99Warning: 2000,
          latencyP99Critical: 5000,
          latencyP95Warning: 1000,
          minRequestsForDetection: 10,
          pluginErrorRateWarning: 10,
          pluginErrorRateCritical: 25,
        },
      },
      platformServices.logger as any
    );

    // Start incident detector
    incidentDetector.start();
    platform.logger.info('Incident detector started');

    // Stop detector on server close
    server.addHook('onClose', async () => {
      incidentDetector.stop();
      platform.logger.info('Incident detector stopped');
    });
  }

  await registerObservabilityRoutes(server, config, repoRoot, historicalCollector, incidentStorage, platformServices);

  await registerAnalyticsRoutes(server, config);

  await registerAdaptersRoutes(server, config);

  await registerLogRoutes(server, config, eventHub);

  await registerPlatformRoutes(server, config, repoRoot);

  await registerAdapterCallRoutes(server);

  await registerDebugRoutes(server, config);

  await registerEventRoutes(server, basePath, registry, readiness, eventHub, config);
}
