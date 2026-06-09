import { createServiceBootstrap } from '@kb-labs/core-runtime';
import { makeAssemblyHook } from '@kb-labs/plugin-runtime';
import { runDaemon } from '@kb-labs/shared-daemon';
import { StateDaemonServer } from './server.js';

export async function bootstrap(_cwd: string = process.cwd()): Promise<void> {
  await runDaemon(
    {
      appId: 'state-daemon',
      defaultPort: 7777,
      portEnvVar: 'KB_STATE_DAEMON_PORT',
      defaultHost: 'localhost',
      hostEnvVar: 'KB_STATE_DAEMON_HOST',
      async setup({ platform, port, host }) {
        const server = new StateDaemonServer({ port, host, logger: platform.logger });
        await server.start();
        return () => server.stop();
      },
    },
    (appId, repoRoot) =>
      createServiceBootstrap({ appId, repoRoot, assemblyHook: makeAssemblyHook() }),
  );
}
