import {
  platform,
  createServiceBootstrap,
  getPlatformRoot,
  getProjectRoot,
} from '@kb-labs/core-runtime';
import { resolvePolicy } from '@kb-labs/core-policy';
import { loadJwtConfig } from './mcp/auth.js';
import { McpDaemonServer } from './server.js';

export async function bootstrap(repoRoot: string = process.cwd()): Promise<void> {
  // 1. Initialize platform (loads .env + adapters from kb.config.json).
  await createServiceBootstrap({ appId: 'mcp-daemon', repoRoot });

  const logger = platform.logger;
  const projectRoot = getProjectRoot() ?? repoRoot;
  const platformRoot = getPlatformRoot();

  // 2. Resolve the authorization policy. With no preset/overrides this is the
  //    permit-all default — the seam the platform tightens later.
  const { policy } = await resolvePolicy({});

  // 3. Resolve bind target: Unix socket overrides TCP when provided.
  const socketPath = process.env.KB_MCP_SOCKET_PATH;
  const port = process.env.KB_MCP_DAEMON_PORT
    ? parseInt(process.env.KB_MCP_DAEMON_PORT, 10)
    : 7779;
  const host = process.env.KB_MCP_DAEMON_HOST ?? 'localhost';

  // 4. Create + start the daemon. The registry initializes inside start().
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

  // 5. Graceful shutdown.
  const shutdown = async (signal: string): Promise<void> => {
    logger.warn('MCP daemon received shutdown signal', { signal });
    await server.stop();
    await platform.shutdown();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
