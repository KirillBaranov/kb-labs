# 0018: Session Recall Resolvers

- Status: Accepted
- Date: 2026-04-04

## Context

After adding claim verification and convergence policy, follow-up recall questions like "Which files did you inspect, exactly?" regressed in two ways:

1. the agent sometimes re-read files it had already inspected, spending unnecessary tokens
2. stricter verification could also cause safe-but-wrong answers that ignored canonical session artifacts

We already persist the necessary truth in canonical artifacts:

- `kernel-state.json`
- `tool-ledger.jsonl`
- `run-ledger.jsonl`

The problem was not missing data. The problem was that direct session recall lived as internal `RuntimeEngine` logic rather than an official extensibility surface.

## Decision

We introduce `SessionRecallResolver` as a first-class SDK extension point.

`SessionRecallResolver`:

- reads canonical session state and recent messages
- may return a direct answer when structured artifacts are sufficient
- bypasses the main LLM/tool loop for that turn
- does not mutate kernel truth
- does not replace general reasoning

The runtime now resolves direct answers through a resolver chain:

1. load kernel
2. select response requirements
3. load recent tool records
4. ask registered `SessionRecallResolver`s
5. if one resolves the answer confidently, complete the run directly
6. otherwise continue into normal prompt construction and loop execution

We ship a default resolver for:

- file recall from `fs_read`
- shell command recall from `shell_exec`

## Consequences

### Positive

- direct recall is now an explicit extension surface instead of hidden runtime branching
- recall questions can be answered from canonical artifacts with `0-token` runs when possible
- future recall capabilities can be added cleanly, for example:
  - inspected directories
  - edited files
  - previous tool usage
  - child-agent outputs
- this keeps the runtime aligned with the architecture rule that structured session truth should be consumed through bounded extension points

### Negative

- runtime now has one more selector/resolver layer to orchestrate
- poorly designed custom resolvers could answer too aggressively if they ignore response requirements

## Rejected Alternatives

### Keep direct recall hardcoded inside `RuntimeEngine`

Rejected because it creates another growing policy bucket inside the runtime core and makes future recall behavior harder to extend and test.

### Solve recall only through prompt context selection

Rejected because the data is already available in canonical artifacts. Spending prompt budget and model calls for deterministic recall is unnecessary.

### Relax claim verification for recall turns

Rejected because the problem is not that verification is too strict. The problem is that deterministic recall should not need the same reasoning path in the first place.
