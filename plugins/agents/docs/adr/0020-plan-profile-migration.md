# 0020: Plan Profile Migration

- Status: Accepted
- Date: 2026-04-04

## Context

`plan` mode is currently one of the largest remaining special-case flows in the agent system.

It already has useful product behavior:

- read-only tool access
- planning-specific prompts
- plan validation through `plan_validate`
- persisted `plan.json` artifacts

But the behavior still lives mainly inside `PlanModeHandler`, which means planning remains a separate execution world rather than a consumer of the shared runtime foundation.

After ADR 0019 (`Runtime Profiles`), the next migration step is to move planning-specific behavior into a profile while keeping the existing handler as a temporary adapter.

## Decision

We introduce `plan-profile` as the first migrated special mode profile.

`plan-profile` currently provides:

- read-only tool policy aligned with `PLAN_READ_ONLY_TOOL_NAMES`
- stricter response requirements (file-backed, evidence-backed, no unsupported claims)
- planning-first prompt overlay
- planning-aware run evaluator for earlier synthesis once enough evidence is gathered
- profile-scoped `ResultMapper` that turns final markdown into `TaskResult.plan` + runtime metadata
- stricter completion policy metadata
- profile-scoped `PlanOutputValidator`
- profile-scoped `PlanArtifactWriter`

`PlanModeHandler` now creates sub-runners with `plan-profile` registered, so planning-specific runtime behavior flows through the shared engine/profile path rather than being embedded only in handler code.

We also extract two former handler responsibilities into reusable planning components and attach them to `plan-profile`:

- `PlanOutputValidator`
- `PlanArtifactWriter`

## Consequences

### Positive

- planning becomes the first real proof that special modes can be migrated onto the profile-driven runtime
- the handler shrinks toward an orchestration adapter instead of owning all planning behavior
- plan result assembly now lives with the profile instead of being rebuilt manually inside the handler
- plan validation and artifact persistence are now profile-scoped instead of being hard-wired inside the handler
- future work on planning quality can happen through profile components instead of runtime branching

### Negative

- `PlanModeHandler` still exists and still owns orchestration for now
- tool policy/completion policy are not yet fully enforced by the shared runtime core, so this is a partial migration step

## Next Steps

1. remove the remaining manual plan-artifact fallback from `PlanModeHandler`
2. improve planning convergence so `plan` stops broad exploratory loops earlier
3. use the same migration shape for `spec`, `debug`, and `edit`
