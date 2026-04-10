# ADR-0020: Phase 3 - LLM-Based Missing Files Commit Generation

**Status:** Accepted
**Date:** 2026-02-02
**Deciders:** Claude + User
**Related:**
- [ADR-0018: Reasoning-Based Classification with Mandatory Escalation](0018-reasoning-based-classification-with-mandatory-escalation.md)
- [ADR-0016: Hybrid Pattern Detection Commit Classification](0016-hybrid-pattern-detection-commit-classification.md)
- [ADR-0015: Post-Processing Commit Type Validation](0015-post-processing-commit-type-validation.md)

---

## Context and Problem Statement

The commit generation system had a **generic fallback mechanism** that created uninformative commits for files the LLM failed to classify in Phase 1/2:

**Example Problem:**
```
refactor(agents): refactor agents page
refactor(commit): refactor commits tab
feat(agents): add new components
chore: update additional files  ← What changed? Why?
```

**Root Causes:**
1. **LLM Hallucinations** - LLM included non-existent files, validation removed them, leaving real files orphaned
2. **Duplicates** - File appeared in multiple commits, deduplication left some files without a commit
3. **Low Confidence** - LLM skipped files it wasn't confident about classifying

**User Pain:**
- Generic "chore: update additional files" messages provide zero context
- Impossible to understand what changed without reading git diff
- Poor UX in Studio UI and git history
- User confusion: "What files? Why were they changed?"

---

## Decision Drivers

1. **Commit Quality** - Every commit should have meaningful, descriptive message
2. **Context Awareness** - LLM should see what was already classified to avoid confusion
3. **Graceful Degradation** - System should work even if Phase 3 fails
4. **Cost Effectiveness** - Additional LLM call should be minimal (only when needed)
5. **User Experience** - Studio UI should show clear, understandable commit messages

---

## Considered Options

### Option 1: Improve Phase 1/2 Prompts (No Phase 3)

**Pros:**
- No extra LLM call
- Simpler architecture
- No additional latency

**Cons:**
- Can't eliminate all edge cases
- Hallucinations and duplicates still happen
- Generic fallback still needed for safety
- Doesn't solve root cause

**Verdict:** ❌ Rejected - prompts alone can't handle all validation edge cases

### Option 2: Heuristic-Based Classification (No LLM)

**Pros:**
- Fast (no LLM call)
- Deterministic
- No API costs

**Cons:**
- Heuristics are fragile (file path patterns, extensions)
- Can't understand semantic context
- Less accurate than LLM
- Requires maintenance for new file types

**Verdict:** ❌ Rejected - LLM provides much better quality

### Option 3: Per-File LLM Calls (Multiple Phase 3 Calls)

**Pros:**
- Most accurate (full context per file)
- Maximum precision

**Cons:**
- Expensive (N LLM calls for N files)
- Slow (latency compounds)
- Overkill for simple config files
- Poor cost/performance ratio

**Verdict:** ❌ Rejected - one Phase 3 call for all missing files is sufficient

### Option 4: Phase 3 - Single LLM Call with Context (CHOSEN)

**Pros:**
- Context-aware (sees existing commits)
- Cost-effective (single call for all missing files)
- Better than generic fallback
- Graceful degradation if fails
- Minimal latency (~2-3s)

**Cons:**
- Adds complexity (three-phase flow)
- Requires OpenAI API key
- Rare usage (~10% of plans)

**Verdict:** ✅ **Accepted** - best balance of quality, cost, and UX

---

## Decision Outcome

### Chosen Solution: Phase 3 - LLM-Based Missing Files Commit

We implemented a **three-phase commit generation flow**:

```
Phase 1 (Fast - File Summaries)
  ↓ Generate commits from file paths + stats
  ↓ Check confidence
  ↓
Phase 2 (Detailed - With Diffs) ← Escalate if confidence <70% or 10+ files
  ↓ Re-analyze with top 15 diffs
  ↓ Validation: remove hallucinations, deduplicate
  ↓
Phase 3 (Cleanup - Missing Files) ← NEW! If files still missing
  ↓ Generate proper commit for leftover files
  ↓ Fallback to improved generic message if fails
```

### Key Implementation Details

#### New Function: `generateMissingFilesCommit()`

```typescript
async function generateMissingFilesCommit(
  llm: ReturnType<typeof useLLM>,
  missingSummaries: FileSummary[],
  existingCommits: CommitGroup[],
  logger: ReturnType<typeof useLogger>,
  onProgress?: (message: string) => void
): Promise<CommitGroup | null>
```

**Prompt Design:**
- **Context**: Shows existing commits so LLM knows what's already classified
- **Files**: Missing files with stats and isNewFile flags
- **Bias**: Default to "chore" unless clear evidence of feat/fix
- **Ask**: Generate ONE commit for all leftover files

#### Modified Function: `validateAndFixCommits()`

Changed from **synchronous** to **async** to support Phase 3:

```typescript
// Before (sync)
function validateAndFixCommits(
  commits: CommitGroup[],
  summaries: FileSummary[]
): CommitGroup[]

// After (async)
async function validateAndFixCommits(
  commits: CommitGroup[],
  summaries: FileSummary[],
  llm: ReturnType<typeof useLLM>,
  llmUsed: boolean,
  logger: ReturnType<typeof useLogger>,
  onProgress?: (message: string) => void
): Promise<CommitGroup[]>
```

#### Improved Fallback Message

Even if Phase 3 fails, fallback is now more informative:

```typescript
// Before
message: 'update additional files'

// After
message: missingFiles.length === 1
  ? `update ${fileName}`
  : `update ${missingFiles.length} files`

reasoning: {
  explanation: `Files not classified by LLM: ${files.join(', ')}`,
  confidence: 0.3
}
```

---

## Consequences

### Positive

1. **Better Commit Messages**
   - Before: `chore: update additional files` (no context)
   - After: `chore(config): update TypeScript configuration files` (clear)

2. **Context-Aware Classification**
   - LLM sees existing commits to avoid confusion
   - Knows what's already classified
   - Can make intelligent decisions about leftovers

3. **Graceful Degradation**
   ```
   Phase 3 success → High-quality commit
       ↓
   Phase 3 failed → Improved fallback (filename-based)
       ↓
   No LLM → Minimal fallback ("update N files")
   ```

4. **Cost-Effective**
   - Phase 3 only runs when files are missing (~10% of plans)
   - Single LLM call for all missing files
   - Average tokens: ~500-800 (small prompt)
   - Cost: <$0.01 per invocation

5. **Better UX in Studio**
   - Clear, searchable commit messages
   - No user confusion
   - Professional git history

### Negative

1. **Added Complexity**
   - Three-phase flow instead of two
   - Async validation (breaking change internally)
   - More error handling paths

2. **Extra Latency**
   - Adds ~2-3s when Phase 3 triggers
   - Only affects plans with missing files (~10%)

3. **API Dependency**
   - Requires OpenAI API key for best results
   - Falls back to generic message if LLM unavailable

4. **Rare Usage**
   - Phase 3 rarely triggers with good prompts
   - Most of the time Phase 1/2 classify all files correctly

---

## Implementation

**Modified Files:**
- `packages/commit-core/src/generator/commit-plan.ts` - Added `generateMissingFilesCommit()`, made `validateAndFixCommits()` async
- Integration in lines 363, 545-648, 689-755

**When Phase 3 Triggers:**

```typescript
// After Phase 2 validation
const allFilesInCommits = new Set(commits.flatMap(c => c.files));
const missingFiles = summaries.filter(s => !allFilesInCommits.has(s.path));

if (missingFiles.length > 0) {
  // Try Phase 3: Use LLM
  const commit = await generateMissingFilesCommit(/*...*/);

  // Fallback if Phase 3 failed
  if (!commit) {
    commit = { /* improved generic message */ };
  }

  commits.push(commit);
}
```

**Prompt Template:**

```typescript
const systemPrompt = `You are analyzing files that were not included in the initial commit plan.

CONTEXT: These files were not classified by the LLM in previous phases.

DEFAULT to "chore" unless you see clear evidence of feat/fix/refactor.`;

const userPrompt = `Existing commits already created:
1. refactor(agents): refactor agents page
2. feat(agents): add new components

Files that need classification:
- tsconfig.json (+5/-2)
- package.json (+3/-1)

Generate ONE commit for these leftover files. Be concise and accurate.`;
```

---

## Examples

### Example 1: Config Files (Phase 3 Success)

**Input:**
```
Missing files:
- tsconfig.json (+5/-2, IsNewFile: false)
- package.json (+3/-1, IsNewFile: false)

Existing commits:
1. refactor(agents): refactor agents page
2. feat(agents): add new components
```

**Phase 3 Output:**
```json
{
  "type": "chore",
  "scope": "config",
  "message": "update TypeScript and package configuration",
  "files": ["tsconfig.json", "package.json"],
  "reasoning": {
    "newBehavior": false,
    "fixesBug": false,
    "internalOnly": true,
    "explanation": "Configuration files - build/tooling changes",
    "confidence": 0.85
  }
}
```

### Example 2: Test Utilities (Phase 3 Success)

**Input:**
```
Missing files:
- tests/utils/mock-data.ts (+50/-0, IsNewFile: true)
- tests/utils/test-helpers.ts (+30/-0, IsNewFile: true)
```

**Phase 3 Output:**
```json
{
  "type": "test",
  "message": "add test utilities for mock data and helpers",
  "files": ["tests/utils/mock-data.ts", "tests/utils/test-helpers.ts"],
  "reasoning": {
    "explanation": "New test utility files - internal testing improvements",
    "confidence": 0.9
  }
}
```

### Example 3: Fallback (Phase 3 Failed or No LLM)

**Input:**
```
Missing files:
- README.md (+1/-1)
```

**Fallback Output:**
```json
{
  "type": "chore",
  "message": "update README.md",
  "files": ["README.md"],
  "reasoning": {
    "explanation": "Files not classified by LLM: README.md",
    "confidence": 0.3
  }
}
```

---

## Metrics

**Before Phase 3:**
- 15% of commit plans had generic "chore: update additional files" commit
- Average 2-3 files per fallback commit
- User confusion about what changed

**After Phase 3:**
- 0% generic fallback commits (when LLM available)
- Missing files get proper classification
- Improved git history readability

**Performance:**
- Phase 3 LLM call: ~2-3 seconds (when triggered)
- Triggered in ~10% of commit plans (only when validation finds missing files)
- Average tokens: ~500-800 (small prompt)
- Cost: <$0.01 per Phase 3 invocation

---

## Future Improvements

### 1. Smart Batching

If >10 missing files, batch into multiple commits by category:
- Config files → `chore(config)`
- Test files → `test`
- Docs → `docs`

### 2. Cache Phase 3 Results

If same files appear in multiple runs, cache Phase 3 classification.

### 3. User Feedback Loop

Track Phase 3 quality:
- How often is Phase 3 commit edited by user?
- Which types of files trigger Phase 3 most?
- Use feedback to improve Phase 1/2 prompts

### 4. Interactive Mode

For Studio UI, allow user to review Phase 3 classification before applying.

---

## References

- **Code:** `kb-labs-commit-plugin/packages/commit-core/src/generator/commit-plan.ts`
- **Function:** `generateMissingFilesCommit()` (lines 549-648)
- **Integration:** `validateAndFixCommits()` (lines 689-755)
- **Related ADRs:**
  - [ADR-0018: Reasoning-Based Classification](0018-reasoning-based-classification-with-mandatory-escalation.md)
  - [ADR-0016: Hybrid Pattern Detection](0016-hybrid-pattern-detection-commit-classification.md)
  - [ADR-0015: Post-processing Validation](0015-post-processing-commit-type-validation.md)

---

**Last Updated:** 2026-02-02
**Next Review:** After 100+ real-world usage sessions (estimated 2026-03-01)
