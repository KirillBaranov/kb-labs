import {
  platform,
  createServiceBootstrap,
  getPlatformRoot,
  getProjectRoot,
} from '@kb-labs/core-runtime';
import { resolvePolicy } from '@kb-labs/core-policy';
import { createCorrelatedLogger, resolveObservabilityInstanceId } from '@kb-labs/shared-http';
import { noopUI } from '@kb-labs/plugin-contracts';
import { loadJwtConfig } from './mcp/auth.js';
import { callOutput } from './mcp/output-capture.js';
import { createBufferedUI } from './mcp/ui.js';
import { McpDaemonServer } from './server.js';

export async function bootstrap(repoRoot: string = process.cwd()): Promise<void> {
  // 1. Initialize platform.
  //    uiProvider is wired here — it flows into initPlatform → createExecutionBackend
  //    so the backend uses it from the start. The execution mode and all other
  //    backend settings come from platform.execution in kb.config.json as usual.
  //    callTool() activates the per-call AsyncLocalStorage context; the backend
  //    calls uiProvider() → gets the call-local buffer → captures plugin output.
  //    Concurrent calls are fully isolated (each has its own AsyncLocalStorage slot).
  await createServiceBootstrap({
    appId: 'mcp-daemon',
    repoRoot,
    uiProvider: (_hostType: string) => {
      const lines = callOutput.getStore();
      return lines ? createBufferedUI((s) => lines.push(s)).ui : noopUI;
    },
  });

  // 2. Correlated bootstrap logger — same pattern as gateway and rest-api.
  const logger = createCorrelatedLogger(platform.logger, {
    serviceId: 'mcp-daemon',
    instanceId: resolveObservabilityInstanceId(),
    logsSource: 'mcp-daemon',
    layer: 'mcp',
    service: 'bootstrap',
    operation: 'mcp-daemon.bootstrap',
  });

  logger.info('MCP daemon platform initialised');

  const projectRoot = getProjectRoot() ?? repoRoot;
  const platformRoot = getPlatformRoot();

  // 3. Resolve the authorization policy.
  const { policy } = await resolvePolicy({});

  // 4. Resolve bind target: Unix socket overrides TCP when provided.
  const socketPath = process.env.KB_MCP_SOCKET_PATH;
  const port = process.env.KB_MCP_DAEMON_PORT
    ? parseInt(process.env.KB_MCP_DAEMON_PORT, 10)
    : 7779;
  const host = process.env.KB_MCP_DAEMON_HOST ?? 'localhost';

  // 5. Create + start the daemon. The registry initializes inside start().
  const server = new McpDaemonServer({
    port,
    host,
    socketPath,
    logger,
    cache: platform.cache,
    platform,
    // Default tenant→platform resolver. Platform overrides when per-tenant
    // isolation lands — no other MCP code changes.
    resolvePlatform: () => platform,
    projectRoot,
    platformRoot,
    jwtConfig: loadJwtConfig(),
    policy,
  });

  await server.start();

  // 7. Graceful shutdown.
  const shutdown = async (signal: string): Promise<void> => {
    logger.warn('MCP daemon received shutdown signal', { signal });
    await server.stop();
    await platform.shutdown();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
