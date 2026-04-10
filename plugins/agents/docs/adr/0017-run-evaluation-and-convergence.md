# ADR 0017: Run Evaluation And Convergence

- Status: Accepted
- Date: 2026-04-04

## Context

After introducing kernel memory, rollups, claim verification, and prompt-context selection, the main remaining weakness for long research runs is convergence. The agent can collect enough evidence to answer, but still continue low-yield exploration that increases token cost and latency.

We want a solution that:

- preserves answer quality
- does not hardcode question taxonomies into the loop
- does not turn convergence into a prompt-only hack
- remains extensible for future mode-specific policies

## Decision

We introduce a first-class `RunEvaluator` runtime extension point.

`RunEvaluator` consumes a structured `IterationSnapshot` after each meaningful loop iteration and returns a `RunEvaluation`:

- `evidenceGain`
- `readinessScore`
- `repeatedStrategy`
- `recommendation: continue | narrow | synthesize`
- `rationale`

The architecture is split as follows:

- `ExecutionLoop` owns control flow
- `LoopContext` owns infrastructure primitives
- `RunEvaluator` owns convergence assessment

The loop does not inspect SDK registries directly. Instead, `LoopContext.evaluateRun(...)` exposes evaluator orchestration as an infrastructure primitive, mirroring `callLLM()` and `executeTools()`.

## Consequences

### Positive

- Convergence becomes a formal runtime subsystem, not a hidden heuristic.
- Mode-specific or domain-specific evaluators can be added later through the SDK.
- The loop can react to low-yield exploration without relying on hardcoded task categories.
- Evaluation signals become available in run metrics and status surfaces.

### Tradeoffs

- Default convergence behavior still uses bounded heuristics in the default evaluator.
- A recommendation such as `synthesize` still needs a loop-level policy to steer the model toward bounded completion.
- Further work may add richer claim-support signals to improve readiness scoring.

## Follow-up

- Persist run-evaluation metrics into canonical run artifacts.
- Add mode-aware evaluators for research, debugging, and spec generation.
- Incorporate claim-support trends into readiness scoring.
