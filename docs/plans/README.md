# Agent Plans

This directory contains structured plans for agent-driven tasks.

## Purpose

All new agent tasks MUST follow the standardized plan template to ensure:
- **Consistency** across different agents and tasks
- **Traceability** of decisions and execution
- **Analytics** for improving future planning
- **Knowledge preservation** for learning from past executions

## Template

Use [plan-template.md](./plan-template.md) as the foundation for all new plans.

## Naming Convention

Plans should be named using the following pattern:

```
YYYY-MM-DD-{agent-id}-{short-description}.md
```

Examples:
- `2026-01-24-mind-assistant-refactor-search-weights.md`
- `2026-01-25-devkit-agent-fix-circular-deps.md`
- `2026-01-26-commit-agent-improve-llm-prompts.md`

## Workflow

### 1. Create Plan (Agent)
```bash
# Agent creates plan from template
cp docs/plans/plan-template.md docs/plans/2026-01-24-{agent-id}-{task}.md

# Fill in metadata and execution plan
# Set status: "draft"
```

### 2. Review & Approve (User)
```bash
# User reviews the plan
# Provides feedback or approves

# Update status: "draft" → "approved"
```

### 3. Execute (Agent)
```bash
# Agent executes plan step-by-step
# Updates status: "approved" → "in_progress"
# Fills execution log in real-time
```

### 4. Complete (Agent)
```bash
# Agent completes all phases
# Fills post-execution analysis
# Updates status: "in_progress" → "completed"
```

### 5. Archive (Manual)
```bash
# Optional: Move completed plans to archive/
mkdir -p docs/plans/archive/2026-01/
mv docs/plans/2026-01-24-*.md docs/plans/archive/2026-01/
```

## Plan Statuses

| Status | Description |
|--------|-------------|
| `draft` | Plan created, awaiting review |
| `approved` | User approved, ready for execution |
| `in_progress` | Currently executing |
| `completed` | Successfully completed |
| `failed` | Execution failed (see execution log) |
| `cancelled` | Cancelled before completion |

## Metadata Fields

All plans include YAML metadata block for analytics:

```yaml
plan_id: "unique-plan-id"           # Unique identifier
agent_id: "agent-name"              # Which agent owns this plan
created_at: "2026-01-24T00:00:00Z"  # ISO 8601 timestamp
status: "draft"                     # Current status
priority: "medium"                  # Task priority
tags: ["refactor", "performance"]   # Categorization
estimated_duration: "30m"           # Time estimate
```

## Analytics

Plans can be analyzed using:

```bash
# Find all plans by agent
grep -l "agent_id: \"mind-assistant\"" docs/plans/*.md

# Find failed plans
grep -l "status: \"failed\"" docs/plans/*.md

# Extract metrics from completed plans
grep -A 10 "### Metrics" docs/plans/*.md
```

## Best Practices

### DO ✅
- **Always use the template** for new plans
- **Fill all metadata fields** for analytics
- **Update status in real-time** during execution
- **Document issues and decisions** in execution log
- **Complete post-execution analysis** for learning

### DON'T ❌
- **Don't skip the template** (no free-form plans)
- **Don't leave metadata empty** (breaks analytics)
- **Don't forget to update status** (causes confusion)
- **Don't skip lessons learned** (miss learning opportunity)

## Example Plan

See [plan-example.md](./plan-example.md) for a complete filled-out example of adding rate limiting to Mind RAG API.

## Active Initiative

Mind RAG Retrieval Reliability planning documents:
- `2026-02-14-mind-rag-reliability-spec.md` - master specification
- `2026-02-14-mind-rag-reliability-execution-plan.md` - phased execution plan
- `2026-02-14-mind-rag-freshness-doc-precedence-spec.md` - freshness/conflict sub-spec

## Integration with Agent System

Agents should:

1. **Read template** from `docs/plans/plan-template.md`
2. **Generate plan** by filling in template fields
3. **Save plan** with proper naming convention
4. **Request approval** from user (status: `draft`)
5. **Execute** step-by-step (status: `in_progress`)
6. **Update** execution log during execution
7. **Complete** with post-execution analysis (status: `completed`)

## Future Enhancements

- [ ] CLI command: `pnpm kb plans create --agent=mind-assistant --task="..."`
- [ ] CLI command: `pnpm kb plans list --status=in_progress`
- [ ] CLI command: `pnpm kb plans analyze --agent=mind-assistant`
- [ ] Dashboard for plan metrics and analytics
- [ ] Auto-archiving of completed plans older than 30 days
- [ ] ML analysis of plan quality vs actual outcomes

---

**Last Updated:** 2026-02-14
**Template Version:** 1.0.0
