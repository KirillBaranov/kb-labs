# User-built production images

**Status:** implemented — consumer-owned derived images are built from release images

## Decision

Production is deployed as a user-owned, immutable image derived from a KB Labs
release image. A release image contains only the selected service and its stable
runtime. It contains neither a user's configuration nor adapters and plugins
chosen by that user. It must fail fast when started without an explicit config
and marketplace lock; release images never carry a fallback composition.

`kb-create` owns the bootstrap path because it is available before a platform
exists. It materializes its recommended defaults into the user's explicit local
composition; provision only installs and validates what that composition names.
`kb` manages an already installed platform and is not a prerequisite for
building the first production image.

This replaces the runtime-provisioning direction in the cloud deployment plan:
there is no install-on-container-start, shared runtime volume, Kubernetes
provision Job, or platform-managed composition registry in the primary path.

## User journey

### 1. Design locally

The user starts with `kb-create`, installs the services, plugins and adapters
they want, and iterates locally. The normal marketplace/configuration flow
produces a working `kb.config.json` and lock data for the selected packages.

### 2. Export a deployment bundle

When the local composition is ready, the user runs:

```bash
kb-create deployment export --root . --service gateway --output ./gateway-prod
```

The command creates a small, reviewable directory:

```text
gateway-prod/
  Dockerfile
  kb.config.json
  marketplace.lock
  release-index.json
  deployment.json
  kb-create
```

The exported lock is portable: package identity, exact version, source and
integrity belong in it. It must not contain a machine-specific `resolvedPath`.
Secrets remain outside the bundle, normally in `.env`, a CI secret store or a
Kubernetes Secret.

### 3. Build the user's image

The generated Dockerfile takes the release image as a build argument and
invokes the bundled standalone `kb-create` provision command during `docker build`:

```dockerfile
ARG KB_BASE_IMAGE
FROM ${KB_BASE_IMAGE}

COPY kb-create /usr/local/bin/kb-create

COPY kb.config.json marketplace.lock deployment.json release-index.json /app/.kb/

RUN kb-create deployment provision \
  --root /app \
  --composition /app/.kb/deployment.json \
  --config /app/.kb/kb.config.json \
  --lock /app/.kb/marketplace.lock \
  --matrix /app/.kb/release-index.json
```

The user builds and publishes this image in their own CI or locally:

```bash
docker build \
  --build-arg KB_BASE_IMAGE=ghcr.io/kb-labs-team/kb-gateway:2.116.0 \
  -t registry.example.com/acme/gateway:2026-08-01 \
  ./gateway-prod
docker push registry.example.com/acme/gateway:2026-08-01
```

### 4. Deploy normally

For a VPS, Compose references the user image. For Kubernetes, Helm values
reference the same user image. Neither target needs package-manager access,
Marketplace access, a build toolchain or KB Labs source code.

```yaml
services:
  gateway:
    image: registry.example.com/acme/gateway:2026-08-01
```

Rollbacks are ordinary image rollbacks.

## `kb-create provision` contract

`kb-create provision` is a deterministic build operation, not a deployment
orchestrator. Given an image root, config and portable lock, it must:

1. install exactly the packages recorded in the lock into that image root;
2. verify integrity and compatibility with the release image/platform version;
3. verify that every package referenced by `kb.config.json` is installed;
4. write target-local runtime discovery metadata, including paths inside the
   image; and
5. fail the image build on any mismatch.

It must not select adapters, generate product configuration, fetch packages at
container start, manage volumes/PVCs, deploy a workload or retain user
composition data.

## Implementation plan

### Phase 1 — Define portable deployment input

1. Specify a portable `marketplace.lock` schema, separating package resolution
   from target-local discovery paths.
2. Add a schema/version field and validation errors that identify the offending
   config entry or package.
3. Publish a versioned, data-driven compatibility matrix with each release.
   It maps named components to packages and expresses ranges between them
   (for example, a runtime release's supported SDK range). `kb-create` must
   consume this artifact rather than hard-coding platform/SDK package names or
   one exact-version rule. Future components such as CLI protocol and Node ABI
   extend the matrix without a new compatibility engine.
4. Add fixtures for a gateway with no adapters, a normal adapter set and a
   deliberately incompatible package.

### Phase 2 — Add deterministic provision to `kb-create`

1. Implement `kb-create provision --root --config --lock` without requiring a
   running platform or workspace checkout.
2. Install production dependencies using the exact portable lock, verify
   integrity, then create the runtime discovery lock with paths rooted at
   `--root`.
3. Make the command idempotent and emit machine-readable errors for CI.
4. Test it in a clean Linux container; a host-local Node resolution is not an
   adequate test.

### Phase 3 — Make release images suitable bases

1. Remove user-specific fallback configuration and adapter packages from
   release service images.
2. Publish version-pinned `kb-create` artifacts/images together with each
   platform release.
3. Ensure the base service image has the minimum package-manager capability
   required by provision, or document the supported multi-stage provisioner
   mechanism.
4. Publish image digests and a compatibility matrix with every release.

### Phase 4 — Make the happy path one command

1. Add `kb-create deployment export --service <name> --platform <version>`.
2. Generate the Dockerfile, `.dockerignore`, portable config and lock without
   copying secrets.
3. Add `kb-create deployment validate <directory>`; it performs the same
   static checks as provision before a remote build is attempted.
4. Support an explicit local/unpublished-package mode that packages selected
   plugins as tarballs in the build context. It must remain opt-in so normal
   deployment contexts stay small.

### Phase 5 — Templates and documentation

1. Provide generated Compose and Helm snippets that reference a user image,
   not a KB Labs image plus runtime installer.
2. Write a self-hosting guide around the four user steps above, including CI
   registry credentials, secrets and rollback.
3. Update ADR-0037 and the cloud deployment overhaul plan to remove the
   runtime-mounted composition as the primary path.
4. Update `.claude/skills/tool-kb-deploy.md` with this flow and explicitly
   prohibit adding adapters to service manifests.

### Phase 6 — End-to-end acceptance

1. From a clean machine, use `kb-create` to create a local gateway composition.
2. Export it, build the derived image without a monorepo checkout, and push it
   to a test registry.
3. Run that image on Compose with only secrets supplied at runtime.
4. Deploy the identical image through Helm to a disposable cluster.
5. Change one adapter, rebuild a new image, confirm the old image still runs,
   then roll back by image tag/digest.

## Non-goals

- Hosting user composition artifacts or images in a KB Labs-controlled
  registry.
- Installing packages during pod/container startup.
- Requiring `kb` to build a production image.
- Adding adapters as direct dependencies of services or plugins.
- Making the deployment target aware of Marketplace business logic.

## Open implementation decisions

1. Whether `kb-create` invokes Corepack/pnpm in the base image or ships a
   dedicated minimal provisioner image. The user-facing contract is identical;
   choose based on image size, supply-chain controls and build reproducibility.
2. How a private package source is represented in the portable lock without
   serialising credentials. Credentials must remain build-time secrets.
3. Whether `deployment export` emits Compose/Helm files by default or only on
   explicit flags. Defaulting to a Dockerfile keeps the first-run path smallest.
