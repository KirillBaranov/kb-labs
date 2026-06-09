# @kb-labs/shared-daemon

Universal process-lifecycle bootstrapper for KB Labs daemon services.

`runDaemon()` owns the boilerplate every daemon repeats — repo-root
resolution, `.env` loading, platform bootstrap, port/host resolution from
env, and graceful `SIGTERM`/`SIGINT` shutdown — so each service only writes
its own `setup()`.

## Usage

```ts
import { runDaemon } from '@kb-labs/shared-daemon';
import { createServiceBootstrap } from '@kb-labs/core-runtime';
import { makeAssemblyHook } from '@kb-labs/plugin-runtime';
import { getListenOptions } from '@kb-labs/shared-http';

await runDaemon(
  {
    appId: 'my-service',
    defaultPort: 5070,
    portEnvVar: 'MY_SERVICE_PORT',
    hostEnvVar: 'MY_SERVICE_HOST',
    async setup({ platform, port, host, repoRoot }) {
      const server = await createServer({ platform, repoRoot });
      await server.listen(getListenOptions(port, host));
      return () => server.close(); // teardown — runs before platform.shutdown()
    },
  },
  // DI: keeps makeAssemblyHook (Layer 1) out of this package
  (appId, repoRoot) =>
    createServiceBootstrap({ appId, repoRoot, assemblyHook: makeAssemblyHook() }),
);
```

## What it handles

- **Env + platform** — resolves `repoRoot` via `findRepoRoot`, loads `.env`,
  bootstraps the platform through the injected factory.
- **Socket isolation** — seeds `KB_SOCKET_HASH` (from `KB_PROJECT_ROOT ?? repoRoot`)
  before config interpolation so `${KB_SOCKET_HASH}` socket paths resolve, matching
  kb-dev's per-project hash.
- **Port/host** — read from the configured env vars with defaults.
- **Shutdown** — a single re-entrant handler runs `setup()`'s teardown, then
  `platform.shutdown()`, then exits; a second signal is ignored.

Pairs with `createDaemonServer()` from `@kb-labs/shared-http`, which owns the
HTTP-layer boilerplate (Fastify, request correlation, observability routes).
