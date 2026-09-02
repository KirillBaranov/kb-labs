# KB Labs release process

A release is one immutable bundle, one human approval over its digest, and a
receipt that records everything that happened to it. Nothing else is a release:
pushing a tag is not, and a green CI run is not.

The authority for the design is [ADR-0043](./adr/0043-release-bundle-and-delivery-boundaries.md),
which supersedes the conflicting ownership statements in ADR-0041 and ADR-0042.
For the operator-facing "how do I actually do this" version, see the
[release control plane runbook](./runbooks/release-control-plane.md).

## The one division of responsibility

| Layer | Owns | Must never |
|---|---|---|
| Release plugin (`@kb-labs/release-manager-cli`) | Every release-domain decision: version policy, package membership, compatibility, changelog, release-index generation, bundle contents, all validation | Publish anything |
| Workflow control plane | Operational state: receipt transitions, version reservations, leases, the approval, the compensation journal | Decide what a release contains |
| CI (`.github/workflows/release-deliver.yml`) | Publishing exact bytes out of a bundle whose digest it was told to expect | Plan, version, stage, package, build, regenerate an index, or infer a channel |
| `kb-create` | Resolving and installing a published release | Read a local index as a fallback, or discover versions from npm tags |

This is enforced, not merely documented: a repository policy test
(`plugins/release/manager-cli/src/__tests__/ci-workflow-policy.test.ts`) fails
the build if a workflow YAML acquires a release decision.

## Channels

Three channels, one monotonic version line.

| Channel | What it means | How it is produced |
|---|---|---|
| `canary` | A candidate that published, smoked and activated successfully | A candidate operation |
| `stable` | A canary promoted after an observation window | A promotion of an existing canary — no new bytes |
| `experimental` | Reserved in the contract; no implementation | Rejected (decision S0.3d) |

A canary carries a final SemVer, not a pre-release suffix. A canary whose smoke
fails **burns** its version: the number is never reused, and republishing the
same bytes is refused.

## The two approvals, and only two

Exactly one approval per operation, two per release cycle:

1. **Candidate approval.** Signs `bundleSha256` — the digest of a bundle that is
   already sealed on disk. Every mutation happens before it, in a disposable
   worktree, so the approval covers finished bytes rather than a plan of what
   bytes might become (decisions S0.3e, S0.3f).
2. **Promotion approval.** Signs the digest of a `StablePromotionPlan` naming the
   exact current-stable and selected-canary identities.

There is no third approval for an exception, and no flag that skips either one.
The candidate driver returns `awaitingApproval` at `bundled` and the only thing
that moves it past is a recorded approval document.

## Candidate: what actually runs

The receipt state machine, in order. Each state is one step, driven by
`kb release candidate`; the same command drives a fresh run and a resumed one,
because the state lives in the receipt rather than in argv.

```
planned → source-checked → staged → bundled ──[approval]──→ approved
  → committed → artifact-delivery-requested → artifacts-published
  → candidate-smoke-passed → canary-activation-requested
  → canary-active → completed
```

`stage`, `package` and `seal` are actions of states *before* `bundled`, so a
receipt at `bundled` or later can never reach them. That is what makes "the
approved digest is what shipped" structural rather than procedural.

## Promotion: what does not run

A stable promotion moves a pointer and some derived aliases. It produces **no**
new package version, **no** new tarball, **no** new binary and **no** new index.
Phases (cutover plan §3C):

- **A — exclusive preflight:** take the lease, re-check the pointer CAS
  precondition against the live document.
- **B — non-public staging:** write the pointer bytes to a key no launcher
  resolves, proving they are publishable without making them public.
- **C — guarded commit:** move the derived npm dist-tags, then the one
  authoritative conditional write of the channel pointer, last.
- **D — observation window:** close on enough clean samples, roll back on a
  critical signal naming a sealed trigger.

Compensation is pointer-first: the previous *sealed* pointer bytes go back before
anything touches an alias. A compensation that cannot land leaves the receipt in
`rollback-needs-attention`, which blocks every later stable promotion until a
human reconciles it.

## Failure semantics

The single most consequential rule: **an npm timeout must not consume a SemVer.**

| Failure | Outcome | Version |
|---|---|---|
| Source check fails | `rejected` | burned |
| Sealed bundle fails verification | `rejected` | burned |
| Public smoke fails functionally | `rejected` | burned |
| Delivery times out / transport error | bounded retry, then `needs-attention` | intact, resumable on the same bundle without a second approval |
| npm dist-tag move fails after a successful stable commit | recorded as degraded | intact; no compensation (decision S0.3b) |
| Public probe fails after the pointer commit | compensation, `rolled-back` | intact |
| Compensation itself fails | `rollback-needs-attention` | intact; stable promotions blocked |

Evidence that names a different receipt, candidate or bundle is rejected
outright rather than folded in — it is a sign the delivery plane is confused
about identity, not a flaky call.

## Trust

SHA-256 digests, verified at every hop. A `signature` field is reserved in every
schema and is currently `null` (decision S0.3a). Published bytes are immutable;
the two mutable documents — the channel pointer and the support policy — are
written only through a conditional (compare-and-set) put, and both are covered by
`DeliveryEvidence`.

## Support lifecycle

`ReleaseSupportPolicy` is a mutable published document. When it is read is a
deliberate, asymmetric choice (execution addendum §7.4):

| Operation | Reads the policy | If the document is unreachable |
|---|---|---|
| `apply --platform-channel <ch>` | **No** | Not applicable — resolving the pointer *is* the support statement |
| `apply --platform-version <v>` | Yes | Fail closed |
| `update` (to an exact version) | Yes | Fail closed |
| `status` | Yes | Degrade to `supportStatus: unknown`; never blocks |

The asymmetry is the point: if the support policy were required for channel
installation, one outage or one poisoned cache would deny service to every new
installation at once. `status` never blocks, because a user whose release left
support must be told even by a service that is down.

`minimumSupported` is monotonically non-decreasing; a publish that lowers it is
rejected. Burned canaries appear in neither `supported` nor `retired` — otherwise
the supported-version list becomes a log of failed smoke runs.

## Everything released before the cutover

Legacy. Not installable through the documented path, and there is no migration
(decision S0.4). `kb-create update` against a pre-cutover platform root fails
with `KB_CREATE_RELEASE_LEGACY_UNSUPPORTED`; `kb-create status` still works and
reports `contract: legacy`. The supported move is a fresh `apply` into a new
platform root.

This is a **support boundary, not a security boundary**: npm versions are never
unpublished, so somebody who deliberately kept an old binary and an old index can
still install with them. Saying otherwise would be false.

See `tools/kb-create/legacy-tombstone/` for the retired binaries-channel
tombstone and the manual step that publishes it.

## Supported platforms

`linux` and `darwin`, on `amd64` and `arm64`. Windows was removed
(decision S0.3c): `install.ps1` is deleted, `kblabs.ru/install.ps1` answers 410,
and any windows target is refused with a typed diagnostic naming the four
supported combinations.
