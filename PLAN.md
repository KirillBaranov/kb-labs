I have enough to write the plan.

PIPELINE_STATUS: NEEDS_IMPLEMENTATION

## Summary
kb-create's Go scaffolder already emits `serviceId` on every upstream (fixed in commit 426a4b11, `tools/kb-create/internal/gateway/gateway.go` `DefaultPlan()` and `scan.GenerateGatewayConfig`) — Option 1 from the issue is already done. What's missing is Option 2: the gateway's Zod schema (`services/gateway/contracts/src/config.ts`) still hard-requires `serviceId` with no fallback, so any config written before `serviceId` became mandatory (introduced in commit 348f229d3, 2026-05-28) — e.g. an existing install upgrading from platform <2.96.0 — still hard-fails on startup exactly as described.

## Root cause / context
- `UpstreamConfigSchema.serviceId` is `z.string().min(1)` (required), added in commit 348f229d3.
- Fresh scaffolds are unaffected now because kb-create's templates were later updated to always populate `serviceId` (matching the upstream key), per commit 426a4b11 — so the "fresh install" repro in the issue would not reproduce against current `main`.
- Existing/previously-installed configs (or any hand-edited/older config predating that key) have no `serviceId` field and will still throw the reported `ZodError` on any gateway upgrade to >=2.96.0. This is the backward-compat gap the issue's Option 2 targets.

## Implementation steps
1. `services/gateway/contracts/src/config.ts` — make `UpstreamConfigSchema.serviceId` optional, and add a `.transform`/`.default` at the `upstreams` record level (in `GatewayConfigSchema`) so that when `serviceId` is absent it defaults to the upstream's own record key. Concretely, replace the plain `z.record(z.string(), UpstreamConfigSchema)` with a `z.record(...)` followed by a `.transform((upstreams) => Object.fromEntries(Object.entries(upstreams).map(([key, u]) => [key, { ...u, serviceId: u.serviceId ?? key }])))`, keeping `UpstreamConfigSchema.serviceId` as `z.string().min(1).optional()`.
2. Verify no other consumer of `UpstreamConfig`/`GatewayConfig` assumes `serviceId` is always present at the type level before this transform runs (grep `UpstreamConfig` usages in `services/gateway/app/src`) — the transform must run before the config is handed to bootstrap so downstream code keeps seeing `serviceId` as a required string.
3. Update `services/gateway/contracts/src/__tests__/schemas.test.ts` to cover: (a) upstream with `serviceId` explicit — passes through unchanged; (b) upstream missing `serviceId` — defaults to the record key; (c) confirm existing tests requiring `serviceId` still pass with the new optional+default behavior.
4. No changes needed to `tools/kb-create` (Option 1 already implemented) — just double check `tools/kb-create/internal/gateway/gateway.go` / `scan.go` still always emit `serviceId` so nothing regresses there.

## Tests / verification
- Add/adjust a unit test in `services/gateway/contracts/src/__tests__/schemas.test.ts` that parses a `GatewayConfigSchema` payload with an upstream lacking `serviceId` and asserts the parsed result has `serviceId` equal to the upstream key (this test must fail before the fix, per the repo's bug-fix rule).
- Manually reproduce: write a `.kb/kb.config.jsonc` with an upstream missing `serviceId` (mirroring the issue's example), start the gateway (`kb-dev start` or direct `pnpm --filter <gateway-app> dev`), confirm it boots instead of throwing `ZodError`.
- Run `pnpm --filter @kb-labs/gateway-contracts test` (adjust package name as needed) and `kb-devkit run test:cli` for gateway-related suites.