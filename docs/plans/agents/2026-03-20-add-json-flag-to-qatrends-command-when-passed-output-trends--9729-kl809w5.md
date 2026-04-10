# Plan: Add --json flag to qa:trends command. When passed, output trends data as structured JSON instead of human-readable text. The JSON should include per-check-type trend arrays (build, lint, types, tests) with timestamps, pass/fail counts, and delta from previous. Update qa-contracts with TrendsJsonOutput type, qa-core trends logic to return structured data, and qa-cli command handler to format as JSON when flag is set.
## Table of Contents
- [Status: INCOMPLETE](#status-incomplete)
- [Task](#task)
- [Research Notes (raw)](#research-notes-raw)
- [Next Steps](#next-steps)
> **WARNING:** This is an incomplete plan. The agent could not generate a proper plan within the iteration budget.

## Status: INCOMPLETE

## Task
- User request: Add --json flag to qa:trends command. When passed, output trends data as structured JSON instead of human-readable text. The JSON should include per-check-type trend arrays (build, lint, types, tests) with timestamps, pass/fail counts, and delta from previous. Update qa-contracts with TrendsJsonOutput type, qa-core trends logic to return structured data, and qa-cli command handler to format as JSON when flag is set.
- The agent was unable to produce a concrete, actionable plan.

## Research Notes (raw)
The following notes were captured during exploration but do not constitute a plan:

- LLM tier "medium" not available or doesn't support tool calling

## Next Steps
- Re-run plan mode with a more focused task description
- Provide additional context or constraints to guide the agent
- Consider breaking the task into smaller sub-tasks
