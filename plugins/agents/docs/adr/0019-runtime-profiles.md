# 0019: Runtime Profiles

- Status: Accepted
- Date: 2026-04-04

## Context

The agent runtime is evolving toward a dual-mode system:

- `assistant` for AI-assisted collaboration
- `autonomous` for routine task execution

Additional modes such as `plan`, `spec`, `debug`, and `edit` are also required.

If each mode keeps adding special branches inside `RuntimeEngine`, the runtime will become a monolith with mode-specific lifecycle logic spread across the core. That would make the architecture harder to extend and eventually recreate the same fragmentation we are trying to remove.

We already have several runtime extension surfaces:

- `TurnInterpreter`
- `PromptContextSelector`
- `ResponseRequirementsSelector`
- `SessionRecallResolver`
- `RunEvaluator`

The missing piece is a first-class way to group those behaviors into a mode/profile configuration without modifying the engine.

## Decision

We introduce `RuntimeProfile` and `ProfileRegistry` behavior through the existing SDK registration surface.

`RuntimeProfile` becomes the unit that configures runtime behavior for a given mode. A profile may define:

- tool policy
- prompt context selectors
- response requirement selectors
- prompt projectors
- session recall resolvers
- run evaluators
- output validators
- artifact writers
- completion policy

`RuntimeEngine` remains mode-agnostic. It now:

1. resolves an active profile once per run
2. uses profile-scoped selectors/resolvers/projectors/evaluators
3. runs profile-scoped completion validators and artifact writers during shared runtime completion
4. falls back to globally registered SDK extensions and built-in defaults

Built-in baseline profiles are provided for:

- `assistant-profile`
- `autonomous-profile`

## Consequences

### Positive

- new modes can be added by composing profiles instead of branching inside the engine
- engine responsibility stays limited to lifecycle orchestration
- assistant and autonomous behavior can diverge safely without forking the runtime
- `plan/spec/debug/edit` can migrate incrementally from handler-centric logic into profile-driven runtime behavior
- future skill overlays can attach to profiles rather than rewriting the engine

### Negative

- the runtime now has another layer of indirection when resolving behavior
- until all legacy handlers are migrated, the system will remain partially transitional

## Rejected Alternatives

### Keep adding mode-specific logic to `RuntimeEngine`

Rejected because this would make the core runtime harder to extend, test, and reason about over time.

### Create a different runtime engine for each mode

Rejected because it would fragment session continuity, duplicate lifecycle logic, and undermine the goal of a shared kernel/store/runtime foundation.

### Use only `ModePolicy` without grouped runtime configuration

Rejected because policy metadata alone is too weak. We need a composition unit that can carry the actual selector/evaluator/validator/writer stack for a mode.

## Migration Notes

This ADR only establishes the foundation:

- profile registration
- profile resolution
- profile-scoped selector/resolver/projector/evaluator consumption
- shared completion consumption for profile validators/writers

Follow-up migration steps:

1. move `assistant` and `autonomous` behavior fully under profiles
2. migrate `plan` into `plan-profile`
3. migrate `spec`, `debug`, and `edit`
4. reduce legacy mode handlers to thin compatibility adapters
