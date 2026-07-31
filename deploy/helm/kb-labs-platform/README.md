# kb-labs-platform Helm chart

Deploys the KB Labs platform's backend units — `gateway`, `rest-api`,
`workflow`, `marketplace`, `marketplace-registry`, `state-daemon`, `mcp`,
`studio` — from the images built in
`docs/plans/2026-07-31-cloud-deployment-overhaul.md` Phase 2. See
[ADR-0037](../../../docs/adr/0037-containers-are-canonical-cloud-delivery.md)
for the design this chart implements.

## Install

```sh
helm install my-platform . --set image.tag=<release-version>
```

`image.tag` is required — the chart refuses to render without it (never
defaults to `latest`, see `docs/deployment/docker-build-hygiene.md`).

## Composition

Declare adapters/plugins in `values.yaml`'s `config` field, and secrets via
`secretRefs` (names of Kubernetes Secrets you create yourself — this chart
never handles secret values directly):

```yaml
image:
  tag: "2.114.0"

config:
  platform:
    adapters:
      cache: "@kb-labs/adapters-redis"
      llm: "@kb-labs/adapters-openai"
    adapterOptions:
      llm:
        apiKey: "${OPENAI_API_KEY}"

secretRefs:
  - my-platform-secrets   # must contain OPENAI_API_KEY, GATEWAY_JWT_SECRET, etc.
```

`${VAR}` placeholders in `config` are **not** touched by Helm — they're
resolved by the running process at boot
(`core/runtime/src/config-interpolation.ts`), from the env `secretRefs`
wires in. Validate a composition before shipping it:

```sh
kb-create validate my-kb.config.json --lock my-marketplace.lock
```

**Leave `config`/`marketplaceLock` empty to run every image's baked default
composition** — this is the "try it" path, no config authoring required. See
`docs/deployment/container-config-override.md` for what "baked default"
means and why an unset value here must mean "mount nothing," not "mount an
empty file" (Kubernetes ConfigMap volumes are unconditional, unlike `docker
run -v` — see the comment in `templates/configmap.yaml`).

## Guardrails enforced at render time

- **`services.workflow.replicas` cannot exceed 1.** `JobBroker`/`CronScheduler`
  run in-process; a second replica double-fires every scheduled job. Setting
  it higher fails `helm template`/`helm install`, not a silent bad deploy.
- **`image.tag` is required.** Unset fails the render with a clear message.
- **`marketplace-registry` waits for `state-daemon`** via an initContainer
  (real runtime dependency — `plugins/marketplace-registry/README.md:44`).

Disable any unit you don't need with `--set services.<name>.enabled=false`
(e.g. `studio`, `mcp`) — no fork required.

## Verified, not yet live-tested

`helm lint` and `helm template` pass, and the guardrails above are confirmed
by rendering with bad input and checking the error. **Not yet run as a real
`helm install` against a live cluster** — no `kind`/`k3d` cluster was
available when this chart was written. Before relying on it in production,
run a real install against a throwaway cluster and confirm pods actually
reach Ready.
