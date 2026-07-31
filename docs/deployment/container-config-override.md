# Container Config Override Contract (ADR-0037)

How composition (adapters, plugins) is delivered to a running container, and what happens when
a required value is missing. Covers `services/gateway/app/` and
`plugins/marketplace-registry/app/` today; the same contract applies to every image added under
[ADR-0037](../adr/0037-containers-are-canonical-cloud-delivery.md).

## Mount points

Each image ships two **fallback** files, applied only if nothing is already at the live path:

| Live path (mount here to override) | Fallback baked into the image |
| --- | --- |
| `/app/.kb/kb.config.json` | `/app/.kb/kb.config.default.json` |
| `/app/.kb/marketplace.lock` | `/app/.kb/marketplace.default.lock` |

`docker-entrypoint.sh` (present in each image) copies the fallback into place at container start
**only if the live path does not already exist** — so a bind mount, ConfigMap-mounted file, or
Kubernetes `subPath` volume always wins, and never gets silently overwritten by the baked default.

```bash
# Override composition without rebuilding the image
docker run \
  -v ./my-kb.config.json:/app/.kb/kb.config.json:ro \
  -v ./my-marketplace.lock:/app/.kb/marketplace.lock:ro \
  ghcr.io/kb-labs-team/kb-gateway:<version>
```

In Kubernetes, mount both as a `ConfigMap`/`Secret` volume at the same paths.

## `${VAR}` interpolation

Config values may reference environment variables: `"apiKey": "${OPENAI_API_KEY}"`. Resolution is
recursive across the whole config (`core/runtime/src/config-interpolation.ts`).

**Strictness depends on `NODE_ENV`:**

- `NODE_ENV=production` (set in every image) — an unresolved `${VAR}` **throws at boot**. The
  process exits non-zero rather than serving traffic with a literal placeholder in its config.
- Any other value — an unresolved `${VAR}` is left intact and a warning is logged; resolution is
  deferred to first use. This preserves local/CLI ergonomics where not every adapter is configured.

Consequence: every `${VAR}` reference in a production config **must** have a value supplied via
`docker run -e` / Kubernetes `env` / `envFrom` before the container starts. There is no partial-boot
mode in production — missing a secret fails the deploy, not the first request.

## What NOT to do

- Do not read `*.default.json` / `*.default.lock` directly, in code or in ops tooling — they are
  the fallback, not the live config. Read `.kb/kb.config.json` / `.kb/marketplace.lock`.
- Do not rely on the baked default in production. It exists so an image is runnable standalone for
  evaluation; production composition should always be supplied via mount.
