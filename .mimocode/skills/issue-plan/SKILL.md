---
name: issue-plan
description: Plan implementation for a GitHub issue. Read the issue, explore the codebase, create an implementation plan, and get approval before coding. Use when the user asks to plan or implement a GitHub issue.
---

# GitHub Issue Implementation Planning

Plan implementation for a GitHub issue systematically.

## Step 1: Read the issue

```bash
gh issue view <ISSUE#> --json title,body,labels,assignees
```

Understand:
- What is the problem?
- What is the expected behavior?
- Are there any constraints or requirements?

## Step 2: Explore the codebase

Find relevant files and understand the current architecture:

```bash
# Find related files
grep -r "keyword" --include="*.ts" --include="*.js" .

# Check existing patterns
find . -name "*.test.ts" -path "*<area>*" | head -20

# Read key files
cat <file-path>
```

## Step 3: Create implementation plan

Structure the plan as:

1. **Summary** — one sentence describing the change
2. **Files to modify** — list each file with what changes
3. **Files to create** — if any new files are needed
4. **Steps** — ordered list of implementation steps
5. **Testing** — how to verify the change works
6. **Risks** — any breaking changes or edge cases

## Step 4: Get approval

Show the plan to the user and wait for approval before implementing.

## Step 5: Implement

After approval, implement the plan step by step:

1. Make changes in the order specified
2. Run tests after each major step
3. Commit with conventional commit format

## Rules

- Never implement without a plan
- Always explore the codebase first — don't guess at file structures
- Check for existing patterns before inventing new ones
- Use `workspace:*` for internal dependencies
- Never use `as any` or `@ts-ignore`
- Run `pnpm --filter <package> build` to verify changes compile
