# CLI Namespace Conventions

These rules apply to all CLI manifest files (`manifest.ts`, `manifest.v3.ts`).
Reference: `docs/plans/cli-naming-audit.md`, ADR-0018.

## Rule 1 — Top-level namespace is a domain noun

The top-level path segment names a **domain** the user works in — never an action.

```
✓  agent run        ← "agent" is the domain
✓  workflow run     ← "workflow" is the domain  
✓  marketplace install
✗  install          ← verb at top level (what domain?)
✗  run-workflow     ← verb phrase at top level
```

Standalone action commands (`commit`, `review`, `scaffold`) are accepted exceptions
when the domain IS the verb concept (the plugin manages "commits" or "reviews").
They must be documented as exceptions, not used as a pattern.

## Rule 2 — Second-level is a verb from the standard vocabulary

Do not invent new verbs. Use the standard set:

| Category   | Allowed verbs                                          |
|------------|--------------------------------------------------------|
| Data       | `list`, `get`, `create`, `update`, `delete`            |
| Lifecycle  | `run`, `start`, `stop`, `apply`, `sync`                |
| Publishing | `publish`, `yank`, `deprecate`, `share`                |
| Info       | `status`, `health`, `logs`, `diag`                     |
| Setup      | `init`, `install`, `uninstall`, `link`, `unlink`       |
| Dev        | `check`, `verify`, `build`, `watch`, `generate`        |

If you need a verb not in this list, propose it as an addition to the standard vocabulary
rather than silently using it.

## Rule 3 — No kebab-case in path segments

Hyphenated segments signal that a subgroup is missing.

```
✗  path: 'quality check-layers'     ← kebab in segment
✓  path: 'quality check layers'     ← proper 3-part subgroup
✓  path: 'quality layers'           ← rename to single verb

✗  path: 'workflow runs-list'
✓  path: 'workflow runs list'

✗  path: 'mind rag-query'
✓  path: 'mind search'              ← rename, "rag" is internal term
```

## Rule 4 — No implementation details in names

Users don't care how it's built. Names should reflect **what it does**, not **how**.

```
✗  infra-worker    ← exposes internal "worker" concept
✓  infra           ← what the user is working with: infrastructure
✓  env             ← or: environment provisioning

✗  mind rag-query  ← "RAG" is an internal ML term
✓  mind search     ← what the user actually does

✗  mind sync-add   ← internal sync mechanism
✓  mind sync add   ← if sync is a subgroup, "add" is the verb
```

## Rule 5 — One package owns one top-level namespace

A single npm package may register multiple commands under one top-level group.
Two packages with different `packageName` values cannot share a top-level group.
This is enforced at runtime (ADR-0018), but the manifest should be designed
with clear namespace ownership in mind.

## What to flag during review

Flag these in manifest files:
- Any `path:` value where a segment (after splitting by space) contains a hyphen
- Any `path:` where the first segment is in: `auth`, `platform`, `info`, `logs`, `docs`, `registry`, `completion`, `__complete`, `__internal`
- Any `path:` where the first segment contains a hyphen
- Verbs at the top level that are not established exceptions (`commit`, `review`, `scaffold`, `release`)
- Names that appear to describe internal architecture rather than user-facing concepts
