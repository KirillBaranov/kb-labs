# Workflow composition hardening

## Goal

Make `workflow:<ref>` a safe, observable composition primitive and use it to
keep feature-delivery workflows small and reusable.

## Acceptance criteria

1. Child invocation survives a daemon restart: a parked parent is reconciled
   once its child reaches a terminal state.
2. Parent cancellation recursively cancels active descendants; child failure,
   cancellation, and timeout produce a deterministic parent outcome.
3. Cycle detection covers the complete ancestor chain and depth is enforced.
4. Parent steps expose the child run ID, terminal status, declared outputs, and
   artifacts without relying on child internals.
5. `quality-assurance` is a reusable workflow composed by `task-to-pr`; it
   owns review, architecture, adversarial QA, functional verification, and
   static quality gates.
6. CLI/Studio run views expose parent/child lineage. Workflow lint rejects a
   missing workspace child reference and static cycles.
7. Automated tests cover success, failure, cancellation, restart recovery,
   cycle/depth rejection, and concurrent parent invocations.

## Design

- Invocation is wait-only in this stage. A parent step becomes `waiting_child`
  and yields its worker slot.
- Invocation state is durable in step metadata. Engine reconciliation is event
  driven plus startup-safe scanning, never an in-memory monitor alone.
- Child input is an interpolated immutable snapshot. The result envelope is
  `{ runId, status, outputs, artifacts }`.
- The workflow engine owns lifecycle and resume scheduling; the daemon worker
  only resolves references and initiates an invocation.

## Delivery slices

1. Move child lifecycle/reconciliation into the engine and add durable lineage.
2. Add invocation resolver, contract validation, cancellation and result envelope.
3. Extract `quality-assurance` and migrate `task-to-pr`.
4. Add graph lint, CLI/Studio lineage, E2E and concurrency coverage.
5. Run the complete PR pipeline and a live daemon verification.

## Non-goals

- `fire-and-forget`, dynamic fan-out, and remote workflow calls.
- Distributed transactions between workflows.
