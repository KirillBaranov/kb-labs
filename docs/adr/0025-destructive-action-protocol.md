# ADR-0025: Destructive-action protocol

- Status: Accepted
- Date: 2026-06-04

## Context

Commands that destroy or remove data (drop an index, uninstall a plugin, roll
back a release, wipe a tenant) need a guard. Two distinct concerns are easy to
conflate:

- **Soft (understanding/UX):** make it clear — to a human and especially to an
  **agent** — that an action is destructive, *how broad* the damage is, and
  whether it can be undone, and require explicit confirmation. Convenient and
  universal, but only a convention: a blind `--yes` (or a buggy/automated
  caller) can pass it. It does not *enforce*.
- **Physical (enforcement):** actually prevent invocation. In KB Labs this is the
  (future) **token/permission layer**: the user scopes an agent's token, the
  platform checks rights, and an ungranted destructive action becomes
  un-invokable — or is filtered out of discovery so the agent never even sees it.

Building physical enforcement into a CLI helper is wrong (bypassable, and it
duplicates what the permission layer will own). Equally, a soft prompt alone is
not safe for critical operations.

## Decision

**Criticality is a declared property of the command, not logic inside it.** One
declaration drives both layers.

1. **Soft layer — now.** `@kb-labs/sdk` exports `confirmDestructive(ctx, { confirmed, isJson, action })`
   (in `@kb-labs/shared-cli-ui`). `action` is a `DestructiveAction` descriptor:
   `{ action, resource, effect, severity, reversible, recovery?, blastRadius?, confirmFlag? }`.
   Without confirmation the command does **not** run in any mode:
   - human → a one-line warning leading with irreversibility + severity;
   - agent (`--json`) → a machine-readable `ConfirmationRequired` signal
     (`confirmationRequired`, `destructive`, `irreversible`, `severity`,
     `blastRadius`, `recovery`, `confirmWith`, `message`) so the agent pauses and
     asks instead of silently destroying.

2. **Severity rubric** — worst-case blast radius weighed against recovery cost
   (consistent across plugins so agents calibrate):
   `low` (narrow scope AND trivially auto-rebuilt from source) ·
   `medium` (a bounded set lost; rebuildable with effort/recompute) ·
   `high` (a WHOLE collection destroyed — entire index/corpus — OR slow/manual
   recovery; large and easy to mis-target even if rebuildable) ·
   `critical` (irreversible, no recovery).
   So `mind drop` is `high` (the whole index goes, even though `index --full`
   rebuilds it) while `mind sync delete` is `medium` (named docs, re-addable).

3. **Physical layer — later.** The token/permission layer reads the **same**
   declared `severity`/`destructive` to filter discovery and block invocation by
   right. Prefer recoverability (soft-delete + retention) over hard-block where
   possible; reserve hard-block for `critical`.

4. **Optional but recommended.** External plugins work without declaring this;
   they work *well* with it (clear to agents now, gated by tokens later). The
   descriptor is surface-agnostic — the same object can feed CLI, REST (`409`),
   and MCP.

## Consequences

- Mind uses it: `mind drop` (high, reversible via `index --full`) and
  `mind sync delete` (medium). Other destructive commands (marketplace
  uninstall, release rollback) should adopt the same descriptor.
- The soft layer is honest about its limits — it informs, it does not enforce;
  enforcement is the token layer's job, keyed off the same declaration.
- A destructive action should also emit an audit event (ties into the ASVS-L3
  audit-port seam) even when only soft-gated — future work.
