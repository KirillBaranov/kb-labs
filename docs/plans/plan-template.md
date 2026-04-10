# Agent Plan Template

## Metadata
```yaml
plan_id: "unique-plan-id"
agent_id: "agent-name"
created_at: "2026-01-24T00:00:00Z"
updated_at: "2026-01-24T00:00:00Z"
status: "draft|approved|in_progress|completed|failed|cancelled"
version: "1.0.0"
estimated_duration: "30m"
actual_duration: null
priority: "low|medium|high|critical"
tags: ["category1", "category2"]
```

## Task Definition

### Original Request
```
[Original user request or task description]
```

### Interpreted Goal
```
[Agent's interpretation of what needs to be achieved]
```

### Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

### Out of Scope
- Item 1
- Item 2

## Context Analysis

### Current State
```
[Description of current system state, existing code, etc.]
```

### Dependencies
- Package/File/Service 1
- Package/File/Service 2

### Constraints
- Technical constraint 1
- Business constraint 2
- Time constraint 3

### Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Risk 1 | High/Medium/Low | High/Medium/Low | Mitigation strategy |

## Execution Plan

### Phase 1: [Phase Name]
**Objective:** [What this phase achieves]

**Steps:**
1. **Step 1.1:** [Action]
   - **Tool:** `tool-name`
   - **Input:** `parameters`
   - **Expected Output:** Description
   - **Validation:** How to verify success

2. **Step 1.2:** [Action]
   - **Tool:** `tool-name`
   - **Input:** `parameters`
   - **Expected Output:** Description
   - **Validation:** How to verify success

**Exit Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

### Phase 2: [Phase Name]
[Repeat structure from Phase 1]

## Verification Strategy

### Testing Approach
- Unit tests: [Description]
- Integration tests: [Description]
- Manual verification: [Description]

### Rollback Plan
```
[Steps to revert changes if something goes wrong]
```

### Quality Gates
- [ ] Code compiles without errors
- [ ] Tests pass
- [ ] No new security vulnerabilities
- [ ] Documentation updated
- [ ] AI Review passes (`pnpm kb review:run --mode=full --agent`)

## Resources

### Files to Modify
- `path/to/file1.ts` - [Reason]
- `path/to/file2.ts` - [Reason]

### Files to Create
- `path/to/new-file.ts` - [Purpose]

### External Resources
- Documentation: [URLs]
- Related ADRs: [List]
- Related Issues: [List]

## Analytics & Learning

### Complexity Assessment
```yaml
cognitive_load: "low|medium|high|very_high"
technical_complexity: "low|medium|high|very_high"
code_changes_estimate: "small|medium|large|very_large"
estimated_lines_changed: 0
```

### Knowledge Gaps
- Gap 1: [What information is missing]
- Gap 2: [What assumptions are being made]

### Alternative Approaches
1. **Approach 1:** [Description]
   - Pros: [List]
   - Cons: [List]
   - Reason not chosen: [Explanation]

2. **Approach 2:** [Description]
   - Pros: [List]
   - Cons: [List]
   - Reason not chosen: [Explanation]

## Execution Log

### Phase Completion
| Phase | Status | Started | Completed | Duration | Notes |
|-------|--------|---------|-----------|----------|-------|
| Phase 1 | completed | 2026-01-24T10:00:00Z | 2026-01-24T10:15:00Z | 15m | - |
| Phase 2 | in_progress | 2026-01-24T10:15:00Z | - | - | - |

### Issues Encountered
1. **Issue 1:** [Description]
   - **Severity:** critical|high|medium|low
   - **Resolution:** [How it was resolved]
   - **Impact:** [Effect on plan]

### Decisions Made
1. **Decision 1:** [What was decided]
   - **Rationale:** [Why]
   - **Alternatives considered:** [What else was considered]
   - **Impact:** [Effect on plan]

## Post-Execution Analysis

### Actual vs Estimated
```yaml
estimated_duration: "30m"
actual_duration: "45m"
variance: "+50%"
variance_reason: "Unexpected integration issue with package X"
```

### Lessons Learned
- Lesson 1: [What worked well]
- Lesson 2: [What could be improved]
- Lesson 3: [What to avoid next time]

### Metrics
```yaml
lines_added: 0
lines_deleted: 0
lines_modified: 0
files_changed: 0
tests_added: 0
llm_calls: 0
tokens_used: 0
cost_usd: 0.00
```

### Follow-up Tasks
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## Approval

### Required Approvals
- [ ] User approval
- [ ] Technical review (if applicable)
- [ ] Security review (if applicable)

### Approval Log
| Approver | Status | Date | Comments |
|----------|--------|------|----------|
| - | - | - | - |

---

**Template Version:** 1.0.0
**Last Updated:** 2026-01-24
