# Self-hosting KB Labs

> **Historical delivery design — not a V2 launcher interface.** Commands such
> as `kb-create deployment export`, `validate` and `provision` are not exposed
> by the current public `kb-create`. Use the sealed-index workflow in
> [Installation / Update / Uninstall Flow](installation-flow.md) for a
> supported host installation. This document remains as design context for a
> future container-delivery implementation.

KB Labs' cloud delivery path is published container images. You do not need the
monorepo to run the platform.

## Compose on one host

Use the generic release images as the base for your own service images. First
create and test the composition locally, then export the selected service
contexts and build them in your own CI:

```sh
kb-create deployment export --root . --service gateway --output ./build/gateway
docker build \
  --build-arg KB_BASE_IMAGE=ghcr.io/kb-labs-team/kb-gateway:2.116.0 \
  -t ghcr.io/your-org/kb-consumer-gateway:2.116.0 \
  ./build/gateway
```

Repeat this for `rest-api`, `workflow`, and `marketplace-registry`. The
generated context contains the user's `kb.config.json`, `marketplace.lock`,
compatibility metadata, and a build-time provisioning step. The release image
does not install adapters or plugins and does not provide a fallback config.

Use `infra/docker-compose.backend.yml` as the consumer-side template. Set
`BASE_IMAGE_TAG` for generic images, `CONSUMER_IMAGE_TAG` and
`CONSUMER_IMAGE_REGISTRY` for the four derived images, plus the required
runtime secrets, then run `docker compose up -d`. Ports, domains, reverse
proxy, volumes, and environment remain under the consumer's control.

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

Production images contain the composition baked into the consumer-owned
derived image. A plain generic release image is intentionally incomplete and
fails fast without the required composition. See [the override
contract](../deployment/container-config-override.md) for the failure behavior.
