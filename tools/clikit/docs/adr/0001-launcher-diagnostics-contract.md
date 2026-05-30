# ADR-0001: Launcher diagnostics contract (human + agent)

**Date:** 2026-05-30
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-05-30
**Tags:** cli, dx, tooling

## Context

KB Labs' running principle is "the platform always says WHAT happened and WHERE
to look": the TypeScript side carries structured errors (`KbError {code,
message, hint, meta}` in `core/config/src/errors/kb-error.ts`), plugins attach
hints/reasons, and services emit a dual human/JSON/agent envelope
(`shared/cli-ui/src/command-result.ts` `CommandOutput {ok, status, human, json,
agent}`).

The **Go launcher tools** (kb-create, kb-deploy, kb-dev, kb-devkit) do not meet
this bar:

- Errors are bare `fmt.Errorf("...")` strings — no code, no reason, no hint.
- Some failures are **silent** (e.g. `kb-create swap` skips service registration
  without a word when `dist/manifest.json` is missing → daemons never start, yet
  the user sees "success"). This cost hours of live debugging during the cloud
  deploy dogfood.
- Output formatting (`cmd/output.go`) is copy-pasted across three tools and
  divergent in the fourth; `--json` exists in only two of four.

Each tool is its own Go module (kb-create 1.24, kb-deploy/kb-dev 1.25, kb-devkit
1.22), with no `go.work` and no shared code.

Constraints considered: keep the per-tool independent `make -C tools/<x> build`
model; importable by the lowest Go version in the set (kb-devkit 1.22); no
desire to preserve backward compatibility of the current `--json`/human output.

## Decision

Introduce a shared module **`github.com/kb-labs/clikit`** under `tools/clikit`
that mirrors the platform contract, and migrate all four launchers onto it.

1. **`diag.Diag {Code, Message, Reason, Hint, Meta}`** — mirrors `KbError`, adds
   an explicit `Reason` (WHY) distinct from `Hint` (WHAT TO DO / WHERE TO LOOK).
   Satisfies `error`, so it flows through cobra `RunE` unchanged. A code→hint
   registry (like `ERROR_HINTS`) and an exit-code mapping live alongside.

2. **`result.CommandOutput {Ok, Status, Human, JSON, Agent}`** — mirrors the
   platform `CommandOutput`, with a renderer selecting human / json / agent. The
   error path (`RenderDiag`) prints `message + reason + hint` for humans and
   `{ok:false, error:{code, message, reason, hint, meta}}` for machines (agent
   mode omits `meta` for compactness).

3. **`ui`** — the single canonical lipgloss output helper, deduping the
   copy-pasted `cmd/output.go`.

4. **Output modes**: `--json` (full), `--agent` (compact), and the canonical
   `--output=human|json|agent` (wins on conflict). No backward compatibility is
   kept — the envelope and human output are unified on the new shape outright.

5. **Module wiring**: each tool depends on clikit via a `replace` directive
   (`=> ../clikit`); an optional `tools/go.work` is for gopls only and is
   non-authoritative (CI builds with `GOWORK=off`). clikit targets **go 1.22**
   and pins **lipgloss v1.1.0** so kb-devkit can import it.

6. **No silent failures**: every swallowed error / silent skip becomes a
   warning- or error-class `Diag` surfaced in the result envelope (e.g. the
   swap manifest-missing case → `ERR_MANIFEST_MISSING` warning with a hint;
   the opaque `wave N failed` → a structured Diag carrying per-action failures).

## Consequences

### Positive

- Uniform, structured, dual-audience output across all launchers; agents get
  machine-parseable `{code, reason, hint}`, humans get the same plus pretty
  rendering.
- Silent failures become visible — the class of bug that hid the deploy breakage
  cannot recur unnoticed.
- One source of truth for output styling; the per-tool copy-paste is removed.

### Negative

- **Breaking change**: the `--json` error shape changes from `{ok:false, hint}`
  to `{ok:false, error:{...}}` and human output is rewritten; existing scrapers
  break. Accepted deliberately (no dual-shape / transition aliases).
- A new shared module + `replace` directives add a small amount of module
  plumbing; clikit must stay at the go 1.22 floor or kb-devkit breaks (guarded
  in CI).

## Rollout

Phased, each phase independently green: (0) this ADR; (1) the `clikit` module +
tests; (2) adopt per tool — kb-deploy → kb-create → kb-dev → kb-devkit, each a
self-contained PR converting that tool's `Execute()` to the Diag handler, wiring
the flags, and eliminating its silent-failure sites.
