import { createServiceBootstrap, platform } from '@kb-labs/core-runtime';
import { findRepoRoot } from '@kb-labs/core-sys';
import { StateDaemonServer } from './server.js';

export async function bootstrap(cwd: string = process.cwd()): Promise<void> {
  const repoRoot = await findRepoRoot(cwd);
  await createServiceBootstrap({ appId: 'state-daemon', repoRoot });

  const port = process.env.KB_STATE_DAEMON_PORT
    ? parseInt(process.env.KB_STATE_DAEMON_PORT, 10)
    : 7777;
  const host = process.env.KB_STATE_DAEMON_HOST ?? 'localhost';

  const server = new StateDaemonServer({
    port,
    host,
    logger: platform.logger,
  });

  await server.start();
}

