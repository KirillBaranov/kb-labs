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

   `pnpm kb logs` is the canonical reader after a service platform has started: it queries the shared aggregate populated by services and plugins. Capability flags describe available query features. `query`, `search`, and `context` must return the same records for equivalent time/context filters.

2. Start broad and machine-readable:

   ```bash
   pnpm kb logs diagnose --from 30m --json
   pnpm kb logs query --service-id <service-id> --from 30m --json
   ```

3. Narrow by correlation once an ID is known:

   ```bash
   pnpm kb logs context --request-id <requestId> --json
   pnpm kb logs context --trace-id <traceId> --json
   pnpm kb logs context --execution-id <executionId> --json
   ```

4. Combine text, context, and time filters as needed:

   ```bash
   pnpm kb logs query --level error --from 1h --json
   pnpm kb logs search "distinctive error text" --service-id <service-id> --from 30m --json
   pnpm kb logs get <log-id> --related --json
   ```

   `--from` and `--to` accept `30m`, `1h`, `2d`, or ISO-8601 timestamps. Boundaries are inclusive.

5. Use the managed process log only before platform initialization, after a crash that prevented central publication, or to compare raw stdout/stderr with a suspected delivery gap:

   ```bash
   ./tools/kb-dev/kb-dev status --config .kb/devservices.dev.yaml
   ./tools/kb-dev/kb-dev logs <service> --lines 200 --config .kb/devservices.dev.yaml
   ```

   In workspace development always use `.kb/devservices.dev.yaml`; it launches workspace `dist` artifacts. Preserve evidence before `restart`, because it cascades to dependent services.

## Investigation order

1. Establish service, time range, operation, and symptom.
2. Inspect `platform.failed`, `service.failed`, `error`, and `fatal` first.
3. Follow one `requestId`, `traceId`, or `executionId` through `logs context`; confirm start and completion and matching root identity.
4. Compare lifecycle: `platform.ready` → `service.starting` → `service.ready` → request/plugin events → `service.stopping` → `service.stopped`.
5. Classify startup/configuration, dependency, transport/request, plugin execution, shutdown, or delivery/filtering failure.
6. State the smallest root-cause fix and its verification command. Do not implement unless asked.

## Contract to expect

Every platform-owned record retains `applicationId`, `serviceId`, `instanceId`, and `layer`.

The core-owned vocabulary is `applicationId`, `serviceId`, `instanceId`, `layer`, `pluginId`, `component`, `operation`, `requestId`, `traceId`, `executionId`. Adapters import `LOG_CONTEXT_FIELDS` from `@kb-labs/sdk/adapters` for filters, indexes, and projections—never maintain a local list.

Request records use `component=http-request`, `operation=http.request`, `requestId`, `traceId`, `http.method`, `http.url`, `http.route`, and `http.status_code` on completion. Plugins add `pluginId`, `pluginVersion`, and `pluginKind` without replacing parent identity or correlation.

Use `debug` for high-volume mechanics, `info` for lifecycle and request completion, `warn` for recoverable degradation, and `error`/`fatal` only for failed work. `KB_LOG_LEVEL=silent` suppresses normal output. Durable retention defaults for `debug` and `info` are 30 minutes; configure overrides in `kb.config.json` when needed.

## Writing diagnostics

Use `IContextLogger` from `@kb-labs/core-platform`, never `console` or a hand-rolled logger. Derive scope from the supplied logger. `diagnostic` is emitted only with `KB_DIAGNOSTICS=agent`; never include secrets, tokens, request bodies, or private user data.

## Report format

Return symptom; evidence (event IDs, correlation IDs, timestamps); root cause or bounded uncertainty; impact; smallest fix; verification. Separate observations from hypotheses.
