# @kb-labs/shared-daemon

Universal process-lifecycle bootstrapper for KB Labs daemon services.

`runService()` is the only process launcher for KB Labs services. It owns root
resolution, layered `.env` loading, platform initialisation, port/host
resolution and graceful `SIGTERM`/`SIGINT` shutdown; a service only writes its
own `setup()`.

## Usage

```ts
import { runService } from '@kb-labs/shared-daemon';
import { makeAssemblyHook } from '@kb-labs/plugin-runtime';
import { getListenOptions } from '@kb-labs/shared-http';

await runService({
    appId: 'my-service',
    defaultPort: 5070,
    portEnvVar: 'MY_SERVICE_PORT',
    hostEnvVar: 'MY_SERVICE_HOST',
    platform: { assemblyHook: makeAssemblyHook() },
    async setup({ platform, port, host, projectRoot }) {
      const server = await createServer({ platform, projectRoot });
      await server.listen(getListenOptions(port, host));
      return () => server.close(); // teardown — runs before platform.shutdown()
    },
});
```

## What it handles

- **Env + platform** — resolves platform/project roots, loads their `.env`
  layers, derives shared platform environment and initialises adapters through
  the declared assembly hook.
- **Port/host** — read from the configured env vars with defaults.
- **Shutdown** — a single re-entrant handler runs `setup()`'s teardown, then
  `platform.shutdown()`, then exits; a second signal is ignored.

Pairs with `createDaemonServer()` from `@kb-labs/shared-http`, which owns the
HTTP-layer boilerplate (Fastify, request correlation, observability routes).
