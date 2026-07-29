import { makeAssemblyHook } from "@kb-labs/plugin-runtime";
import { runService } from "@kb-labs/shared-daemon";
import { StateDaemonServer } from "./server.js";

export async function bootstrap(_cwd: string = process.cwd()): Promise<void> {
  await runService({
    appId: "state-daemon",
    startDir: _cwd,
    defaultPort: 7777,
    portEnvVar: "KB_STATE_DAEMON_PORT",
    defaultHost: "localhost",
    hostEnvVar: "KB_STATE_DAEMON_HOST",
    platform: {
      assemblyHook: makeAssemblyHook(),
    },
    async setup({ port, host, logger }) {
      const server = new StateDaemonServer({
        port,
        host,
        logger,
      });
      await server.start();
      return () => server.stop();
    },
  });
}
