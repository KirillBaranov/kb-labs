# Preview environments

Per-PR preview deployments at `*.stage.kblabs.ru`. The infrastructure pieces
(nginx routing, wildcard TLS, scripts) live in the **private** `kb-labs-infra`
repo. This folder holds the **public** pieces: the deploy manifest template
and the docker-compose template that the GitHub Actions workflow renders for
each PR.

## How it works

```
PR opened with "preview" label
        │
        ▼
.github/workflows/preview.yml
        │
        ├─ envsubst → .kb/deploy/_rendered/preview.yaml
        │           → .kb/deploy/_rendered/docker-compose.yml
        │
        ├─ kb-deploy plan          → which targets changed (watch: globs)
        │                            exit 0 = nothing → skip preview
        │                            exit 2 = affected → continue
        │
        ├─ scp compose             → ~/kb-previews/pr-N/docker-compose.yml
        │
        ├─ kb-deploy apply         → build, push GHCR, ssh, docker compose up
        │
        ├─ ssh kb-preview-apply N  → nginx site config + reload (per service)
        │
        └─ comment URLs on PR
```

## Activation

Add the **`preview`** label to a PR. Without it nothing happens — this is the
resource throttle (each preview eats ~1 GB RAM on the VPS, 2 concurrent
previews max).

## URL scheme

For PR #42:

| Service | URL |
|---|---|
| Web     | `https://pr-42.stage.kblabs.ru`       |
| Gateway | `https://pr-42-api.stage.kblabs.ru`   |
| Docs    | `https://pr-42-docs.stage.kblabs.ru`  |

Only services whose `watch:` paths changed in the PR get spun up — see
`deploy.yaml.tmpl` for the affected-path globs.

## Port allocation

Deterministic from the PR number:

```
base = PR_NUMBER * 10 + 30000
web     = base + 0
gateway = base + 1
docs    = base + 2
```

So PR #42 uses ports 30420 / 30421 / 30422 on `127.0.0.1`. Nginx routes the
public `*.stage.kblabs.ru` hostnames to those ports.

## What's NOT in this folder

| Concern | Where |
|---|---|
| nginx site templates    | `kb-labs-infra/nginx/snippets/preview-site.conf.tmpl` |
| `kb-preview-apply`/`-remove` | `kb-labs-infra/scripts/` (installed to `/usr/local/sbin/`) |
| Wildcard cert procedure | `kb-labs-infra/docs/runbook.md` |
| Sudoers for the deploy user | `kb-labs-infra/docs/runbook.md` |

This split is intentional: routing + certs are operator-private detail of
**our** kblabs.ru deployment. The build/push/spin pipeline lives here because
it's tied to the source code of the services it ships.

## Required GitHub secrets

In repo settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `PREVIEW_SSH_HOST` | VPS hostname / IP (same as prod, for now) |
| `PREVIEW_SSH_USER` | `deploy` |
| `PREVIEW_SSH_KEY`  | PEM contents of the deploy private key |

GHCR auth uses the auto-provided `GITHUB_TOKEN` — no extra secret needed.

## Debugging

```bash
# What previews are live?
ssh deploy@<host> 'ls ~/kb-previews/'

# Containers for PR #42
ssh deploy@<host> 'docker ps --filter "name=kb-preview-pr-42-"'

# Gateway logs for PR #42
ssh deploy@<host> 'docker logs --tail 200 kb-preview-pr-42-gateway'

# Active nginx site configs for PR #42
ssh deploy@<host> 'ls /etc/nginx/sites-enabled/ | grep ^preview-pr-42-'

# Force teardown (idempotent)
ssh deploy@<host> 'sudo /usr/local/sbin/kb-preview-remove 42 && \
                   cd ~/kb-previews/pr-42 && docker compose down -v && cd .. && rm -rf pr-42'
```

## Extending

### Adding a new previewable service

1. Add a target to `deploy.yaml.tmpl` with appropriate `watch:` globs and a
   `container_name` of `kb-preview-pr-${PR_NUMBER}-<svc>`.
2. Add a service to `docker-compose.yml.tmpl` with a unique port offset.
3. Update the port computation in `.github/workflows/preview.yml`
   (`Compute preview ports` step) to allocate the new offset.
4. Update the `SERVICE_MAP` in the `Wire nginx` step to route the new target.
5. Add a subdomain mapping case in `kb-labs-infra/scripts/preview-apply.sh`.

### Why kb-deploy, not raw docker?

`kb-deploy` already does build → push → ssh → compose up with state
tracking (`.kb/deploy-state.json`) and affected detection via `watch:` paths.
We don't need to reinvent that for previews — we just hand it a rendered
manifest. See `tools/kb-deploy/README.md` for the full feature set.
