# Runbook — release control plane

Operator-facing. For *why* the system is shaped this way, read
[docs/RELEASE-PROCESS.md](../RELEASE-PROCESS.md) and
[ADR-0043](../adr/0043-release-bundle-and-delivery-boundaries.md).

> **Read this first.** A production release cannot currently be driven from this
> repository. The release plugin, the receipt state machine, the sagas and the CI
> delivery workflow are all implemented and tested; what does not exist is the
> Workflow-side adapter that dispatches `release-deliver.yml` and reads its
> evidence back, and the two endpoints it would write through (decisions S0.1 and
> S0.2). `kb release candidate` without `--dry-run` refuses with a typed
> diagnostic saying exactly that, on purpose — see
> [Not yet possible](#not-yet-possible) at the end. Everything below is accurate
> for what exists; the sections that need unbuilt infrastructure say so inline.

---

## 1. Where the state lives

Everything operational is a file. There is no database and no dashboard.

| What | Path | Written by |
|---|---|---|
| Receipts (append-only JSONL, one file per receipt) | `.kb/release/receipts/<receiptId>.jsonl` | the Workflow, sole writer, under a host-local lock |
| Promotion leases | `.kb/release/leases/` | the Workflow |
| Compensation journals | `.kb/release/journals/` | the Workflow |
| Version ledger | `.kb/release/ledger/` | the Workflow |
| Sealed candidate bundles | `.kb/release/candidates/<candidateId>/bundle/` | the release plugin |
| Dry-run copies of all of the above | `.kb/release/dry-run/…` | dry runs only |

A dry run writes under its own root so a rehearsal can never be mistaken for, or
collide with, a real release.

CI has **no** write access to any of these. A runner holding npm and CAS
credentials still cannot write one byte of operational state — `kb release
deliver-request` is given no receipt store, no ledger and no lease.

---

## 2. Running a release

### 2.1 Rehearse it first

```sh
pnpm -s kb release candidate --flow platform --target canary --dry-run --json
```

This drives the **real** receipt state machine, the real file-backed stores and
the real approval gate against a simulated build and fake delivery adapters. It
proves the orchestration, including durability across processes. It builds,
publishes and points at nothing.

It stops at `bundled` and reports `awaitingApproval: true`. That is correct.

### 2.2 Drive the candidate

```sh
pnpm -s kb release candidate --flow platform --target canary --json
```

Same command for a fresh run and for a resume — there is no `--resume` flag,
because the state is in the receipt, not in argv. Run it again after the
approval and it continues from wherever the receipt is.

`--target stable` and `--target experimental` are refused: stable is a promotion
of bytes that already exist, and experimental is contract-only (decision S0.3d).

It stops at `bundled`. Read the release map it prints before approving: the
commit, the planned version, the full package and binary set, the changelog, the
compatibility delta, the checks and the planned route — rendered **over the
sealed bundle**, so `bundleSha256` in it is the digest of bytes that already
exist on disk.

### 2.3 Approve, once

```sh
pnpm -s kb release approve --receipt <receiptId> --actor "$USER" --json
```

To refuse:

```sh
pnpm -s kb release approve --receipt <receiptId> --decision reject \
  --actor "$USER" --comment "why" --json
```

A refusal destroys the disposable worktree, burns the reserved version and moves
the receipt to `cancelled`. It does not touch `master` and publishes nothing.

Then re-run §2.2 to carry it to `completed`.

### 2.4 Promote a canary to stable

The promotion saga (`advanceStablePromotion`) is implemented and tested, and
`kb release approve` already handles a `promotion-checked` receipt. **There is
no CLI command that drives the promotion saga.** It is reachable today only
programmatically. This is a gap, not a policy — see
[Not yet possible](#not-yet-possible).

When driven, a promotion runs Phase A (lease + pointer CAS precondition) →
Phase B (non-public staging) → Phase C (aliases, then the one authoritative
pointer write) → Phase D (observation window), and creates **no** new package
version, tarball, binary or index.

> `kb release promote` is **not** this. It is the pre-cutover command that
> publishes whatever package versions are in the current checkout to the npm
> stable dist-tag, with no bundle, no receipt and no approval. Do not use it to
> promote a release.

---

## 3. Reading a receipt

One receipt explains the whole state of a release without opening a single CI
log. That is the design goal; if you find yourself in Actions to answer "what
happened", say so, because it means the receipt is missing evidence.

```sh
# One receipt, in full
pnpm -s kb release receipt --receipt <receiptId> --json

# Everything currently in a given state
pnpm -s kb release receipt --state needs-attention --json
pnpm -s kb release receipt --state rollback-needs-attention --json

# "Why can I not promote to stable?"
pnpm -s kb release receipt --blocking --json
```

### What to read, in order

1. **`state`** — where it is. Terminal states are `completed`, `rejected`,
   `cancelled`, `rolled-back`.
2. **`binding`** — `candidateId`, `bundleSha256`, `indexSha256`,
   `releaseCommit`, `treeSha256`. These are bound once and never rewritten; a
   later event may not change a digest an earlier one fixed.
3. **`transitions`** — the ordered history, each with actor, time and reason.
   The `reason` on the last transition is why it stopped.
4. **`evidence`** — what backs each move. `delivery-evidence`,
   `smoke-evidence`, `channel-evidence`, `pointer-evidence`, and
   `delivery-attempt-failed` entries for each transient retry.

### Reading the state

| State | Means | Version |
|---|---|---|
| `bundled` | waiting for the single approval | reserved |
| `needs-attention` | a transient failure exhausted its retry budget | **intact**, resumable |
| `rejected` | a functional failure — bad checks, bad bundle, failed smoke, mismatched evidence | **burned** |
| `cancelled` | the approval was refused | burned |
| `rolled-back` | stable was promoted and then compensated back | intact |
| `rollback-needs-attention` | the compensation itself failed — stable is drifted | intact; **blocks all stable promotions** |

The distinction that matters most: `needs-attention` is infrastructure and
`rejected` is a verdict. An npm timeout must never consume a SemVer.

---

## 4. Resuming `needs-attention`

A parked receipt is resumed by running the ordinary command again over the same
receipt id. Nothing is rebuilt, and **no second approval is asked for** — the
one approval already covers this bundle.

```sh
# 1. Find out what parked it.
pnpm -s kb release receipt --receipt <receiptId> --json

# 2. Fix the underlying cause (registry outage, endpoint credentials, network).

# 3. Re-drive. Same command, same flags.
pnpm -s kb release candidate --flow platform --target canary \
  --receipt <receiptId> --json
```

The receipt records which step's acknowledgement was lost, so the resume retries
exactly that step with the same bundle digest and the same target. It cannot
re-run `stage`, `package` or `seal`: those are actions of states before
`bundled`, and `assertNoRebuild` fails loudly if anything ever tries.

**Do not** start a new candidate to work around a parked one. That allocates a
second version for one release, which is the exact thing the ledger exists to
prevent.

If the underlying cause is that the bundle itself is wrong, the answer is not a
resume — reject the receipt and produce a new candidate.

---

## 5. Late rollback

"Late" means: stable already moved, and the problem surfaced afterwards.

### 5.1 Inside the observation window

The promotion saga does this itself. Phase D collects signals and rolls back
automatically on a critical signal naming a sealed trigger. Compensation is
**pointer-first**: the previous *sealed* pointer bytes are restored before
anything touches a derived npm alias, so the authoritative document is never
left behind the aliases that derive from it.

The bytes it restores are the previous pointer sealed **into the same bundle**,
under the same approval. CI never renders a pointer of its own. A compensation
that cannot name what it restores refuses rather than republishing the pointer
it exists to undo.

### 5.2 After the window closed

There is no rollback verb. The compensation path is authorised by the promotion
approval and is bounded by that promotion; once the receipt is `completed`, the
supported move forward is:

1. Fix the defect.
2. Produce a **new** candidate through §2.
3. Promote it.

Re-pointing stable at an older release by hand means writing a pointer document
no approval covered. Do not.

### 5.3 `rollback-needs-attention`

The compensation ran and its restoring write could not land. Stable is still
pointing at the promoted release, and that drift is real — it is deliberately
**not** reported as a successful rollback.

This state blocks every later stable promotion until reconciled. To reconcile:

```sh
pnpm -s kb release receipt --blocking --json
pnpm -s kb release receipt --receipt <receiptId> --json
```

Read the journal for that promotion (`.kb/release/journals/`). Exactly one
operation is marked `authoritative`; its `status` tells you whether the pointer
write applied, failed, or compensated-and-failed. Compare it against what the
endpoint actually serves. Then decide, deliberately and with a second person,
whether to re-drive the compensation or to roll forward with a new release.

This is the one place in the system where a human is expected to make a judgment
call, which is why it is a hard stop rather than an automatic retry.

### 5.4 Not a rollback

`kb release rollback` restores `package.json` files from a local snapshot taken
by the pre-cutover release pipeline. It has nothing to do with the control plane
and does not touch a channel pointer, a receipt or a published artifact.

---

## 6. Support policy

```sh
pnpm -s kb release support-policy --flow platform \
  --minimum-supported platform-2.120.0 --json
```

Rules the command enforces:

- `minimumSupported` is monotonically non-decreasing. A publish that lowers the
  floor is rejected — it is a revocation channel, and narrowing it must go
  through the same CAS and evidence as a pointer move.
- Burned canaries appear in neither `supported` nor `retired`. A version that was
  reserved and never activated is `KB_CREATE_RELEASE_NOT_ACTIVATED`, not
  `KB_CREATE_RELEASE_RETIRED`.
- `legacyNotice` text lives in the document, never in the launcher binary.
  Rewording it must not require publishing a new launcher.

The first version of this document must be published **before** the first stable
descriptor.

---

## 7. Diagnostics you will see

Launcher-side (`kb-create`):

| Code | Means | Operator action |
|---|---|---|
| `KB_CREATE_RELEASE_LEGACY_UNSUPPORTED` | pre-cutover epoch: schema mismatch, listed in neither `supported` nor `retired` | none — the supported move is a fresh `apply` into a new platform root |
| `KB_CREATE_RELEASE_RETIRED` | EOL inside the new contract; carries `replacedBy` | install what `replacedBy` names |
| `KB_CREATE_RELEASE_NOT_ACTIVATED` | a burned canary: the version exists but was never activated | pick an activated release |
| `KB_CREATE_RELEASE_DIGEST_MISMATCH` | a document's bytes do not hash to what the referring document declared | **stop.** Either a publication is corrupt or the endpoint is serving something it should not |
| `KB_CREATE_RELEASE_TARGET_UNSUPPORTED` | this release publishes no launcher for this `{os, arch}`, or the target is off the matrix | check the matrix: linux/darwin × amd64/arm64 |

Control-plane side, on a receipt: `KB_RELEASE_EVIDENCE_MISMATCH`,
`KB_RELEASE_POINTER_PRECONDITION_MISMATCH`, `KB_RELEASE_FORBIDDEN_REBUILD`,
`KB_RELEASE_RESUME_IDENTITY_MISMATCH`.

`KB_RELEASE_FORBIDDEN_REBUILD` in particular should never occur. If it does, the
"a sealed receipt cannot be rebuilt" invariant was violated by code, not by an
operator — treat it as a P0 in the release system itself.

---

## 8. Escalation

There is currently one owner for the plugin, Workflow, CI and `kb-create`
workstreams. Until that changes, escalation is a stop rule rather than a routing
table.

**Stop and do not publish** if any of these is true. Re-enabling the old release
tooling is explicitly **not** an approved rollback strategy — if a gate on the
new contract fails, the new path gets fixed.

- Any gate on the new contract fails.
- A `KB_CREATE_RELEASE_DIGEST_MISMATCH` appears anywhere.
- A receipt is in `rollback-needs-attention`.
- The published bytes are not bit-identical to the bytes whose digest was signed.
- The tree digest of a release commit does not equal `provenance.treeSha256`.

**Reconcile with a second pair of eyes**, never alone: anything that requires
writing to the pointer endpoint outside a saga.

**Safe to handle solo:** a `needs-attention` resume, a rejected candidate, a
refused approval.

---

## 9. Not yet possible

Stated plainly so nobody plans around a capability that does not exist. Each of
these is implemented as far as this repository can implement it; what is missing
is deployed infrastructure or a piece of wiring.

| Gap | What is missing |
|---|---|
| Driving a real (non-dry-run) release | A Workflow-side `DeliveryAdapter`/`ActivationAdapter` that dispatches `.github/workflows/release-deliver.yml`, waits for the run and reads back its `DeliveryEvidence` artifact. The CI half exists and runs today via `kb release deliver-request`; the dispatching half does not. `liveAdaptersUnavailable` refuses rather than falling back to fakes. |
| Any channel pointer or support policy publication | The S0.1 endpoint: an object store with conditional PUT (If-Match) on a kblabs.ru domain. Not deployed. `FileCasStore` is the local stand-in used by tests and by CI runs against `KB_RELEASE_CAS_DIR`. |
| Durable receipts surviving the workspace | The S0.2 store: append-only files on vm-1 with the Workflow as sole writer under a host-local lock. Today receipts are files in this checkout's `.kb/release/`. |
| Driving a stable promotion from the CLI | A command wrapping `advanceStablePromotion`. The saga and its approval path exist; nothing invokes them from argv. |
| Publishing the legacy tombstone | A manual `gh release upload` by someone with write access to the repository's GitHub Releases. See `tools/kb-create/legacy-tombstone/README.md`. |
| The §3D production acceptance test | A public `kblabs.ru/install.sh`, a real npm registry, real GitHub Releases and a clean machine. The closest achievable substitute — the full candidate→canary→stable path over the real adapters against local transports — is `plugins/release/manager-cli/src/shared/__tests__/control-plane-release-e2e.test.ts`, and it is explicitly not a replacement. |
