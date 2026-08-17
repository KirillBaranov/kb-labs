---
name: task-rag
description: RAG-based task research — gather codebase context before starting any non-trivial implementation
globs:
  - "**"
---

# Task Research via RAG

Before writing code for any non-trivial task, use RAG to orient in the codebase. This saves unnecessary file reads and prevents working in the wrong place.

## When to run RAG

Run at task start when:
- You don't already know which files to touch
- The task mentions a concept, feature, or system you haven't seen in this session
- The scope of change is unclear

Skip RAG when:
- The user pointed at a specific file/line
- You just read the relevant code in the same session
- It's a trivial change (rename, add field to known struct)

## Workflow

### 1. Formulate 1-3 targeted queries

Cover different angles of the task:
- **What exists**: "how does X work" / "where is Y implemented"
- **Entry point**: "where is Z called from" / "what triggers W"
- **Contracts**: "interface for X" / "types used by Y"

Run each query:
```bash
pnpm kb mind rag-query --text "your question" --agent 2>/dev/null | grep "^{"
```

### 2. Parse the response

```json
{
  "answer": "...",
  "confidence": 0.7,
  "sources": [
    { "file": "plugins/foo/src/bar.ts", "lines": [12, 45], "kind": "code", "snippet": "..." }
  ]
}
```

- **`sources`** — read these files. They are the ground truth, not the `answer`.
- **`confidence`**:
  - `≥ 0.7` — sources are reliable, read them and proceed
  - `0.4–0.7` — read sources but run a follow-up query for gaps
  - `< 0.4` — weak signal; try a more specific query with exact identifiers
- **`kind: "adr"`** — architectural intent, not current implementation. Always verify against code.

### 3. Read the sources

Use the `Read` tool on files from `sources`. Lines from the response are a hint — read the full function/class context around them.

### 4. Run follow-up queries for gaps

If the first queries left open questions (missing caller, unknown type, unclear config):
```bash
pnpm kb mind rag-query --text "exact identifier or concept" --agent 2>/dev/null | grep "^{"
```

Use exact names when possible: `discoverManifests`, `WorkerPool`, `ChunkGatherer` — keyword-heavy queries find implementation files better than NL descriptions.

## Query patterns that work well

| Goal | Query pattern |
|---|---|
| Find implementation | `"FunctionName implementation"` or `"FileName.ts FunctionName"` |
| Understand flow | `"how does X work in Y"` |
| Find callers | `"where is FunctionName called"` |
| Find config | `"config options for X"` |
| Find tests | `"tests for ModuleName"` |

## What RAG does NOT replace

- Reading the actual file when you need full function signatures, types, or field names
- `grep` / `find` for exact string matches
- Git history for understanding why something was written a certain way
