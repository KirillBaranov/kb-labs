# First-plugin onboarding: implementation plan

> **Status:** in progress  
> **Scope:** local-first MVP from one engineering pain to a first useful KB Labs command.

## Product contract

The user chooses an outcome, not platform components. KB Labs configures the safe local pieces automatically and asks only for decisions that affect data or access.

MVP ready-made outcomes:

- **Prepare my commits** — generate a reviewable commit plan; no commit or push in the first run.
- **Prepare a release** — generate a release plan; no publication in the first run.

The third core route is **Create my own command**. It is a contract-driven scaffold path rather than another preset: one command, minimum permissions, a portable coding-agent handoff packet, and a safe preview where the command can mutate data.

Review, QA, and ready-made integration presets are post-MVP expansions.

## UX invariants

Every meaningful step communicates, in a short human voice:

1. the outcome being reached;
2. what KB Labs handles automatically;
3. the one thing required from the user or their agent;
4. what happens next.

The first useful command is explicit and safe (analyze, plan, or preview). The launcher never runs a review, creates a git commit, pushes, publishes, or sends data outside the machine without a separate user action.

Analytics is an independent consent choice in **every** onboarding. Free LLM Gateway is a separate consent, used only by an AI outcome; it explains its actual data boundary, quota and privacy notice. BYOK and local/skip remain available.

## Delivery sequence

| Package | Outcome |
|---|---|
| P1 | Manifest outcome contract and selection plumbing |
| P2 | Outcome-first wizard, local-first default, consent and install-plan screens |
| P3 | Preflight, resumable onboarding state, `kb-create continue`, readiness and one-command handoff |
| P4 | Commit and release install → first-command paths with E2E coverage |
| P5 | Free Gateway/BYOK/analytics wiring; no remote LLM adapter without consent |
| P6 | Contract-driven, one-command plugin scaffold with build/link/discovery |
| P7 | Portable agent handoff packet and permission/file allowlist checks |
| P8 | Optional result-first Studio deep link; CLI remains sufficient for first value |
| P9 | Clean-machine, privacy and recovery launch proof |

## Recovery contract

After confirmation, `.kb/onboarding/` stores the selected outcome, install plan, readiness state and references to logs/consents/agent packet—never secrets, diffs or prompts.

- `kb-create doctor` explains the environment, install and command-discovery state.
- `kb-create continue` repeats only incomplete safe work and returns one next step.
- Retries never cause external duplicate mutations, implicit commits or permission expansion.

## P1 implementation

`manifest.Intent.firstCommand` is the single source of truth for:

- the safe first CLI command;
- side-effect level;
- conditional requirements such as LLM, environment values and services;
- data-boundary copy;
- Studio availability.

The embedded manifest defines this contract for `commit` and `release`; wizard selections preserve it for future readiness and handoff code.
