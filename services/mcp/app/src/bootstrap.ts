import { makeAssemblyHook } from "@kb-labs/plugin-runtime";
import { resolvePolicy } from "@kb-labs/core-policy";
import { noopUI } from "@kb-labs/plugin-contracts";
import { runService } from "@kb-labs/shared-daemon";
import { loadJwtConfig } from "./mcp/auth.js";
import { callOutput } from "./mcp/output-capture.js";
import { createBufferedUI } from "./mcp/ui.js";
import { McpDaemonServer } from "./server.js";

export async function bootstrap(): Promise<void> {
  await runService({
    appId: "mcp-daemon",
    defaultPort: 7779,
    portEnvVar: "KB_MCP_DAEMON_PORT",
    defaultHost: "localhost",
    hostEnvVar: "KB_MCP_DAEMON_HOST",
    platform: {
      uiProvider: (_hostType: string) => {
        const lines = callOutput.getStore();
        return lines ? createBufferedUI((s) => lines.push(s)).ui : noopUI;
      },
      assemblyHook: makeAssemblyHook(),
    },
    async setup({
      platform,
      logger: serviceLogger,
      port,
      host,
      projectRoot,
      platformRoot,
    }) {
      const logger = serviceLogger
        .forComponent("mcp-bootstrap")
        .forOperation("mcp.bootstrap");

      logger.info("MCP daemon platform initialised");

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
  });
}
