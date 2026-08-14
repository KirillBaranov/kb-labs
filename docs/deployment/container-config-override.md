# Production composition contract

> **Historical container-delivery proposal.** It references pre-V2 launcher
> commands (`deployment export`, `provision`) that are not public operations
> today. The active installer contract is the sealed release index described
> in [the launcher lifecycle](../guides/installation-flow.md).

KB Labs release images contain service code only. They never include a default
`kb.config.json`, `marketplace.lock`, adapter package, or fallback composition.
A release image started directly fails before launching the service.

Build a user-owned image with `kb-create deployment export`; its generated
Dockerfile copies an explicit config and lock, then runs `kb-create provision`
at image build time. The resulting image is the artifact deployed to Compose
or Kubernetes.

```text
local kb-create installation
  -> explicit config + portable lock
  -> user-owned derived image
  -> VPS / Kubernetes
```

`kb-create` may choose recommended defaults while creating the local
composition. Those defaults are written into the user's files and are visible
for review. The release image and provision step do not add or substitute
adapters.

Every `${VAR}` in an exported production config must be supplied as an image
runtime environment variable or Secret. `NODE_ENV=production` makes an
unresolved variable fatal at boot.
