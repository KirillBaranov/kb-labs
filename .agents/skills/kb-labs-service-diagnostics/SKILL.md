---
name: kb-labs-service-diagnostics
description: Diagnose KB Labs daemon, HTTP, plugin, startup, shutdown, and request failures from structured logs. Use when a KB Labs service is unhealthy, crashes, behaves unexpectedly, emits noisy logs, loses request/plugin context, or an agent needs evidence before proposing a fix. Uses `pnpm kb logs` first and the managed `kb-dev` service log only as a fallback.
---

# KB Labs service diagnostics

Use structured records as evidence. Do not infer a cause from a single message, restart a service before preserving evidence, or add logging before identifying the missing observation.

## Read path

1. Start with the platform-wide structured store:

   ```bash
   pnpm kb logs stats --json
   ```

   `pnpm kb logs` is the canonical reader after a service platform has started:
   it queries the shared aggregate populated by services and plugins. The
   capability flags describe available query features. `query`, `search`, and
   `context` must return the same records for equivalent time/context filters.
   An unexpectedly empty result for a running service is an aggregation,
   reader configuration, or filter problem—not proof that the event did not
   happen.

2. Start broad and machine-readable:

   ```bash
   pnpm kb logs diagnose --from 30m --json
   pnpm kb logs diagnose --from 30m --source <service-id> --json
   ```

3. Narrow by correlation once an ID is known:

   ```bash
   pnpm kb logs context --request-id <requestId> --json
   pnpm kb logs context --trace-id <traceId> --json
   pnpm kb logs context --execution-id <executionId> --json
   ```

4. Use primitives only to answer a specific question:

   ```bash
   pnpm kb logs query --service-id <service-id> --from 30m --json
   pnpm kb logs search "distinctive error text" --service-id <service-id> --from 30m --json
   pnpm kb logs get <log-id> --related --json
   pnpm kb logs summarize --from 1h --source <service-id> --json
   ```

   `--from` and `--to` accept relative values (`30m`, `1h`, `2d`) or ISO-8601
   timestamps. Boundaries are inclusive. Use a narrow absolute range when
   verifying a filter; do not infer a missing record from an unbounded query.

5. Use the managed process log only before its platform has initialized, after a
   crash that prevented central publication, or to compare raw stdout/stderr with
   a suspected aggregation failure:

   ```bash
   ./tools/kb-dev/kb-dev status --config .kb/devservices.dev.yaml
   ./tools/kb-dev/kb-dev logs <service> --lines 200 --config .kb/devservices.dev.yaml
   ```

   This is **raw process output**, not a replacement read-path. If it contains
   a platform record missing from `pnpm kb logs`, report the delivery gap and
   investigate the shared aggregation path. Follow only while observing a
   reproducer; stop following afterwards. Use `--all` only when a bounded tail
   cannot establish the lifecycle.

   For workspace development, always pass `--config .kb/devservices.dev.yaml`
   to `kb-dev`. It launches workspace `dist` artifacts. The default manifest
   may launch an installed platform instead and is not valid evidence for a
   workspace code change. Preserve central logs before `restart`: it cascades
   to dependent services.

## Investigation order

1. Establish scope: service, time range, operation, and user-visible symptom.
2. Inspect `platform.failed`, `service.failed`, `error`, and `fatal` events first.
3. Follow the same `requestId`, `traceId`, or `executionId` through `logs context`.
   Confirm the aggregate timeline has both request start and completion, and
   that their `applicationId`, `serviceId`, `instanceId`, and `layer` match.
4. Compare the canonical lifecycle: `platform.ready` → `service.starting` → `service.ready` → request/plugin events → `service.stopping` → `service.stopped`.
5. Classify the failure: startup/configuration, dependency, transport/request, plugin execution, shutdown, or noise/duplication.
6. State the smallest root-cause fix and the exact verification command. Do not implement unless asked.

## Contract to expect

Every platform-owned record must retain these inherited fields:

`applicationId`, `serviceId`, `instanceId`, `layer`.

The canonical context vocabulary is owned by core and supplied through the SDK:
`applicationId`, `serviceId`, `instanceId`, `layer`, `pluginId`, `component`,
`operation`, `requestId`, `traceId`, `executionId`. Do not create adapter-local
lists of these fields. Adapters must import `LOG_CONTEXT_FIELDS` from
`@kb-labs/sdk/adapters` when implementing filtering, indexing, or projection.

Request records additionally use `component=http-request`, `operation=http.request`, `requestId`, `traceId`, `http.method`, `http.url`, `http.route`, and `http.status_code` on completion.

Plugins add `pluginId`, `pluginVersion`, and `pluginKind`; domain data is namespaced, e.g. `workflow.run_id` and `plugin.handler`. A child may add context but must not replace parent identity or correlation values.

Use `debug` for high-volume mechanics (request start, individual route mounts), `info` for meaningful lifecycle milestones and request completion, `warn` for recoverable degradation, and `error`/`fatal` only for failed work. `KB_LOG_LEVEL=silent` must suppress normal output. Durable retention defaults are intentionally short for `debug`/`info` (30 minutes); investigate promptly or configure retention in `kb.config.json`.

## Writing diagnostics

Use `IContextLogger` from `@kb-labs/core-platform`, never `console` or a hand-rolled logger. Start from the supplied logger and derive scope:

```ts
const logger = serviceLogger
  .forComponent("plugin-loader")
  .forOperation("plugin.load", { requestId, traceId })
  .forPlugin({ pluginId, pluginVersion });

logger.event("error", {
  event: "plugin.load_failed",
  message: "Plugin failed to load",
  error,
  fields: { "plugin.manifest_path": manifestPath },
  diagnostic: {
    summary: "Plugin manifest could not be loaded",
    causes: [{ kind: "manifest_read_failed" }],
    remediation: [{ action: "Validate the manifest and rebuild the plugin" }],
    confidence: "high",
  },
});
```

`diagnostic` is emitted only with `KB_DIAGNOSTICS=agent`; never put secrets, tokens, request bodies, or private user data in it. Existing `logDiagnosticEvent()` calls are valid and gain the same envelope when their logger is contextual.

## Report format

Return: symptom; evidence (event IDs, correlation IDs, timestamps); root cause or explicitly bounded uncertainty; impact; smallest fix; verification. Separate observations from hypotheses.
