# @kb-labs/adapters-environment-docker

Docker-based implementation of `IEnvironmentProvider` for KB Labs full-cycle runs.

## Features

- Create long-lived environments with `docker run -d`
- Query environment status via `docker inspect`
- Idempotent destroy via `docker rm -f`
- Lease renewal contract for orchestrator integration

## Example config

```json
{
  "adapters": {
    "environment": "@kb-labs/adapters-environment-docker"
  },
  "adapterOptions": {
    "environment": {
      "defaultImage": "node:20-alpine",
      "defaultTtlMs": 3600000,
      "mountWorkspace": true,
      "workspaceMountPath": "/workspace"
    }
  }
}
```
