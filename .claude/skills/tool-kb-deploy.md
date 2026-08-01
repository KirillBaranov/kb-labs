---
name: tool-kb-deploy
description: Deploy KB Labs services and platform safely to dev/stage or production. Use release-published images for production and manual image builds only for non-production environments.
globs:
  - "tools/kb-deploy/**"
  - "sites/**"
---

# KB Labs Deployment

Use this skill whenever a user asks to deploy KB Labs, publish or pull platform Docker
images, update the VPS, troubleshoot deployment storage, or choose between a release
deployment and a stage/dev image build.

There are two intentionally separate deployment paths:

| Environment | Image source | Allowed tags |
|---|---|---|
| dev/stage | Manual build from a selected ref | `dev-<sha>` or `stage-<sha>` |
| production | Images published by the platform release workflow | immutable `X.Y.Z` release tag |

Never build production images inside the production deploy job. The release workflow
must be the single producer of production images and the version-pinned Compose artifact.

## Platform Compose workflow

The platform Compose workflow manages the eight GHCR images:

`kb-state-daemon`, `kb-marketplace-registry`, `kb-marketplace`, `kb-gateway`,
`kb-rest-api`, `kb-workflow`, `kb-mcp`, and `kb-studio`.

The release workflow (`.github/workflows/publish-platform-images.yml`) already:

1. checks out the `platform-vX.Y.Z` release tag;
2. builds production dependencies with isolated `pnpm deploy --prod`;
3. publishes `ghcr.io/kb-labs-team/kb-<service>:X.Y.Z`;
4. uploads a version-pinned Compose file to the GitHub Release.

Production deployment should only pull those images, run the Compose health checks, and
then perform scoped cleanup. Do not use `latest` for production.

## Adapter composition

Service and plugin packages never declare concrete `@kb-labs/adapters-*` packages as
dependencies. Adapter implementations are selected by the customer's platform config
and installed at runtime through the marketplace/provisioning flow. The release images
contain the service code only; do not add adapters to a service manifest or bake a
default adapter set into a production marketplace lock.

When provisioning a deployment, install only the adapters explicitly selected by the
customer, then verify the resulting `.kb/marketplace.lock` and adapter health. A missing
adapter is a configuration/provisioning error; it is not a reason to add that adapter to
the service's `package.json`.

## Choosing the path

### Dev or stage

Use the manual image-build path when testing an unreleased commit or branch:

1. choose the source `ref`;
2. build all eight images once using the release Dockerfiles and isolated production
   dependency trees;
3. tag every image with an environment-prefixed commit tag (`stage-<sha>` or
   `dev-<sha>`), never `latest`;
4. deploy with an environment-specific Compose `.env` and run health checks;
5. clean only old tags belonging to that same environment.

Do not point a production host at a dev/stage tag. Prefer a separate stage host; if the
same VPS is used, use a separate Compose project/network/container naming scheme and
separate volumes so stage cannot replace production containers.

### Production

Use the release version as `IMAGE_TAG` (for example `2.116.0`):

1. verify that the GitHub Release and all eight GHCR image tags exist;
2. log in to GHCR;
3. pull the eight release-tagged images;
4. run `docker compose up -d --remove-orphans`;
5. check gateway, REST, workflow, marketplace, registry, state, and studio health;
6. only after successful health checks, remove old platform release tags while retaining
   the current and one rollback tag.

If the release images are missing or health checks fail, stop and preserve the previous
release. Do not fall back to building images in the production job.

## `kb-deploy` commands

```bash
kb-deploy list                  # list configured deploy targets
kb-deploy status                # show last deployed SHA per target
kb-deploy run                   # deploy affected targets (git diff HEAD~1)
kb-deploy run --all             # deploy all targets
kb-deploy run <target>          # deploy a specific target by name
```

## Legacy/package deployment workflow

For package-based service deployments, use the Go tool as follows:

1. Run `kb-deploy list` to see configured targets and confirm what will be deployed.
2. Run `kb-deploy status` to see the last deployed SHA per target.
3. Use `kb-deploy run --all` or `kb-deploy run <target>` only for the configured
   package-based targets; this is distinct from the platform GHCR Compose path.

For a release-based platform deployment, use the GitHub Actions workflow and pass the
published release version. For dev/stage, use the manual image-build mode described
above.

## Usage

Binary is at `tools/kb-deploy/kb-deploy`. Run from repo root:

```bash
./tools/kb-deploy/kb-deploy <command>
```

## Storage and safety checks

- Before any VPS deployment, inspect `df -h`, `docker system df`, image count, volume
  usage, and container log sizes.
- Use Docker JSON log rotation (`max-size: 10m`, `max-file: 3`) for the platform Compose
  services.
- Cleanup must be scoped to KB Labs platform repositories. Never run a broad
  `docker system prune -af --volumes` as part of a normal production deploy.
- Cleanup before pulling may remove old platform tags to create disk headroom, but must
  retain the newest existing release for rollback. Cleanup after pulling is allowed only
  after all health checks pass.
- Never delete volumes automatically unless the user explicitly approves the exact
  volumes and data-loss impact.
- Always run `list` first for `kb-deploy` targets and `status` after package deployment.
