import { platform, createServiceBootstrap, getPlatformRoot, getProjectRoot } from '@kb-labs/core-runtime';
import { makeAssemblyHook } from '@kb-labs/plugin-runtime';
import { resolvePolicy } from '@kb-labs/core-policy';
import { createCorrelatedLogger, resolveObservabilityInstanceId } from '@kb-labs/shared-http';
import { noopUI } from '@kb-labs/plugin-contracts';
import { runDaemon } from '@kb-labs/shared-daemon';
import { loadJwtConfig } from './mcp/auth.js';
import { callOutput } from './mcp/output-capture.js';
import { createBufferedUI } from './mcp/ui.js';
import { McpDaemonServer } from './server.js';

export async function bootstrap(): Promise<void> {
  await runDaemon(
    {
      appId: 'mcp-daemon',
      defaultPort: 7779,
      portEnvVar: 'KB_MCP_DAEMON_PORT',
      defaultHost: 'localhost',
      hostEnvVar: 'KB_MCP_DAEMON_HOST',
      async setup({ port, host }) {
        const logger = createCorrelatedLogger(platform.logger, {
          serviceId: 'mcp-daemon',
          instanceId: resolveObservabilityInstanceId(),
          logsSource: 'mcp-daemon',
          layer: 'mcp',
          service: 'bootstrap',
          operation: 'mcp-daemon.bootstrap',
        });

        logger.info('MCP daemon platform initialised');

        const projectRoot = getProjectRoot() ?? process.cwd();
        const platformRoot = getPlatformRoot();

        const { policy } = await resolvePolicy({});

        const server = new McpDaemonServer({
          port,
          host,
          logger,
          cache: platform.cache,
          platform,
          resolvePlatform: () => platform,
          projectRoot,
          platformRoot,
          jwtConfig: loadJwtConfig(),
          policy,
        });

        await server.start();

        return async () => {
          await server.stop();
        };
      },
    },
    // platformBootstrap: full init with uiProvider for callOutput ALS wiring.
    // uiProvider flows into initPlatform → createExecutionBackend so the backend
    // captures plugin output from the very start. Concurrent tool calls are
    // fully isolated — each gets its own AsyncLocalStorage slot.
    async (appId, repoRoot) => {
      await createServiceBootstrap({
        appId,
        repoRoot,
        uiProvider: (_hostType: string) => {
          const lines = callOutput.getStore();
          return lines ? createBufferedUI((s) => lines.push(s)).ui : noopUI;
        },
        assemblyHook: makeAssemblyHook(),
      });
      return platform;
    },
  );
}
