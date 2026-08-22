# Test plan — current critical paths

The legacy launcher package is not a public execution path. It remains only
while its unrelated delivery utilities and historical E2E fixtures are being
retired; it is not release evidence. The current executable plan is
[QA and E2E strategy](qa/TESTING-STRATEGY.md).

## Release-critical paths

| Path | Failure prevented | Primary proof |
| --- | --- | --- |
| release index | wrong package/version/bytes reach an installer | staged-manifest extraction, sealing and registry-binding tests |
| request resolution | incompatible platform/SDK/plugin/adapter selection | `tools/kb-create/v2/catalog` and `resolve` tests |
| config rendering | missing or incoherent `kb.config.jsonc` / `devservices.yaml` | `v2/render`, service-graph validation and `v2/verify` tests |
| lifecycle | partial apply/update and unsafe recovery | `v2/runtime`, `v2/lifecycle`, receipt/snapshot tests |
| diagnostics | opaque failure, leaked secret, unsafe automatic repair | `v2/doctor`, `v2/diagnostics`, `v2/logs` tests |
| fresh candidate | released npm artifact is not installable | platform publish workflow `launcher-smoke` |
| running services | process/readiness/cross-service regressions | affected E2E shards under `e2e/` |

## Shared transport matrix

Human wizard, Agent JSON and CI flags are three input transports for one
`kb.create/v2` request. They must not acquire separate install semantics or
have separate acceptance criteria.

| Transport | Input boundary | Required common assertions |
| --- | --- | --- |
| Human | wizard prompts → normalized request | stable/canary and exact selection, provider choice, compatible rejection, generated config, selected plugin, service readiness |
| Agent | JSON request/flow session → transport plan | same resolved artifacts and diagnostics as Human; no secret value in transcript or response |
| CI | direct flags or request file → normalized request | same resolved artifacts and diagnostics as Agent; non-interactive update/rollback is receipt-owned |

`TestTransportMatrixUsesOneResolvedPluginWorkflowPath` is the deterministic
cross-transport integration proof. It exercises the actual wizard, JSON
transport, resolver, renderer, receipt and verifier; only the two external
ports (exact-artifact installer and `kb-dev`) are fixture adapters. It is not
a substitute for the published-artifact E2E gate: that gate must also create a
user plugin and execute a workflow through the installed `kb` CLI.

## Required commands before a launcher change

```bash
cd tools/kb-create
go test -race -count=1 ./...

cd ../..
make e2e
```

Use `pnpm build` for a full dependency-ordered workspace build. Do not use a
recursive `pnpm` build as a substitute for the devkit build graph.

## Acceptance documents

The maintained launcher journeys are [PC-001](qa/scenarios/PC-001-clean-install.md),
[S-001](qa/scenarios/S-001-solo-install-first-run.md),
[S-023](qa/scenarios/S-023-platform-update.md),
[S-024](qa/scenarios/S-024-platform-rollback.md) and
[S-025](qa/scenarios/S-025-diagnose-broken-setup.md). They use only public V2
operations and link their automated evidence.
