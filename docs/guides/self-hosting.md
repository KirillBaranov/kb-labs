# Self-hosting KB Labs

KB Labs' cloud delivery path is published container images. You do not need the
monorepo to run the platform.

## Compose on one host

Download `docker-compose.yml` from the platform GitHub Release that matches the
version you want. Set the required values and start the stack:

```sh
export IMAGE_TAG=2.116.0
export KB_REGISTRY_URL=https://registry.example.com/api/v1
export GATEWAY_JWT_SECRET='change-me'
export OPENAI_API_KEY='...'
export MINIO_ROOT_USER='minio'
export MINIO_ROOT_PASSWORD='change-me-too'
docker compose up -d
```

The release artifact has image tags pinned to its release version. The
`IMAGE_TAG` variable is still accepted for local copies of the source compose
file; it is required there and never defaults to `latest`.

Persistent volumes cover gateway database, storage, analytics, workflow
analytics, Redis, and MinIO data. `workflow` must remain a single instance
because its scheduler and job broker run in-process.

## Kubernetes

Create a Kubernetes Secret containing the variables referenced by your config,
then install the chart with an explicit image tag:

```sh
helm install kb-labs deploy/helm/kb-labs-platform \
  --set image.tag=2.116.0 \
  --set secretRefs[0]=kb-labs-secrets
```

Put composition in `values.yaml` under `config` and, when using a custom
plugin set, provide the matching `marketplaceLock`. `${VAR}` placeholders are
resolved by the process from the referenced Secret at boot; Helm does not
interpolate them.

Validate before deploying:

```sh
kb-create validate kb.config.json --lock marketplace.lock
```

The command rejects unknown adapter slots and adapter packages missing from
the lock. In production, an unresolved `${VAR}` causes the container to exit
instead of serving with an invalid configuration.

The chart refuses `workflow.replicas > 1`, requires an explicit image tag, and
waits for `state-daemon` before starting `marketplace-registry`.

## Composition overrides

Images include an evaluation fallback, but production deployments should
mount `/app/.kb/kb.config.json` and `/app/.kb/marketplace.lock` (or use the
Helm values above). A mounted file always wins over the fallback. See
[the override contract](../deployment/container-config-override.md) for
required environment variables and failure behavior.
