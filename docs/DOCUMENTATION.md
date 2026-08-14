# KB Labs documentation map

This directory documents the current product and its architectural record.
Executable code, release workflows and tests prevail if a document conflicts
with them; amend the document in the same change that changes the contract.

## Start here

- [Launcher lifecycle](guides/installation-flow.md) — public V2 install,
  update, recovery, diagnostics and ownership model.
- [Release process](RELEASE-PROCESS.md) — SDK/platform/binary order, candidate
  gates, promotion and failure handling.
- [QA and E2E strategy](qa/TESTING-STRATEGY.md) — test shard ownership and
  release evidence.
- [QA scenarios](qa/README.md) — maintained acceptance journeys and their
  automated evidence.

## Architecture and decisions

- `architecture/` — current cross-cutting architecture guides.
- `adr/` — accepted decisions. ADRs retain their historical context; their
  implementation references must point at the active code path.
- `plans/` — proposals and historical work plans. A plan is not a public
  contract until it is reflected in implementation and a current guide.

## Documentation rules

1. Public commands and file names must be verified against current `--help`
   and tests. Do not document a planned or removed command as supported.
2. Launcher documentation uses V2 terms: sealed release index, request, plan,
   receipt, snapshot and manifest-derived configuration.
3. Keep secrets out of examples, logs, acceptance records and docs. Use
   environment-variable references instead.
4. Mark preserved proposals and superseded flows as historical at the top of
   the file; do not silently let them masquerade as release instructions.
5. Release/QA documentation links every gate to its owning workflow or test.
