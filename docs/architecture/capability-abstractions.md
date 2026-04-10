# Capability Abstractions (Environment / Workspace / Snapshot)

## Goal

Keep infra capabilities domain-agnostic in core, and move business orchestration to plugins.

- `executionBackend` handles plugin execution and scaling.
- `environment/workspace/snapshot` handle long-lived infra lifecycle.
- orchestrator plugin composes capabilities through `ctx.api.*` and `ctx.api.invoke`.

## Runtime Boundary

- Orchestrator does not need to call adapters directly.
- Plugin handler uses:
  - `ctx.api.environment`
  - `ctx.api.workspace`
  - `ctx.api.snapshot`
  - `ctx.api.invoke`
- Runtime resolves these APIs through managers from platform (`environmentManager`, `workspaceManager`, `snapshotManager`).

## Permissions Matrix

- `platform.environment`: `create`, `read`, `destroy`, `renewLease`, `templates`
- `platform.workspace`: `materialize`, `attach`, `release`, `read`, `sources`, `paths`
- `platform.snapshot`: `capture`, `restore`, `delete`, `read`, `garbageCollect`, `namespaces`
- `invoke.allow`: list of plugins that can be called via `ctx.api.invoke.call()`

## Manifest Examples

### 1. Orchestrator Plugin (invoke-focused)

```ts
permissions: {
  invoke: {
    allow: ['@kb-labs/infra-worker'],
  },
}
```

### 2. Infra Worker Plugin (capability-focused)

```ts
permissions: {
  platform: {
    environment: {
      create: true,
      read: true,
      destroy: true,
      renewLease: true,
      templates: ['node-*'],
    },
    workspace: {
      materialize: true,
      attach: true,
      release: true,
      read: true,
      sources: ['repo://*'],
      paths: ['/workspace/*'],
    },
    snapshot: {
      capture: true,
      restore: true,
      delete: true,
      read: true,
      garbageCollect: true,
      namespaces: ['runs/*'],
    },
  },
}
```

## Invoke Flow Example

1. Orchestrator handler receives task input.
2. Orchestrator calls `ctx.api.invoke.call('@kb-labs/infra-worker', payload)`.
3. Infra worker performs `workspace/materialize`, optional `environment` actions, and `snapshot/capture`.
4. Infra worker returns capability IDs (`workspaceId`, `environmentId`, `snapshotId`).
5. Orchestrator continues business flow (agents, gates, human review) using returned IDs.
