# @kb-labs/agent-core

Main agent engine for KB Labs. Handles LLM orchestration, tool execution, budget management, quality gates, and task validation.

## Core Class

```typescript
import { Agent } from '@kb-labs/agent-core';

const agent = new Agent(config, toolRegistry);
const result = await agent.execute('Fix the authentication bug');
```

The `Agent` class runs an iterative LLM tool-calling loop: classify task, execute tools, check quality, validate completion.

## Module Map

The engine is decomposed into 15+ focused modules extracted from the main `Agent` class:

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `execution/` | State machine, ledger, checkpoint | `ExecutionStateMachine`, `ExecutionLedger` |
| `budget/` | Iteration limits, quality scoring, tier selection | `IterationBudget`, `QualityGate`, `TierSelector` |
| `prompt/` | System prompt construction | `SystemPromptBuilder` |
| `tool-input/` | Tool call normalization and guards | `ToolInputNormalizer` |
| `progress/` | Progress tracking | `ProgressTracker` |
| `search-signal/` | Search heuristics for discovery tasks | `SearchSignalTracker` |
| `analytics/` | Run KPIs, EMA baselines, regression detection | `RunMetricsEmitter` |
| `reflection/` | Self-evaluation between iterations | `ReflectionEngine` |
| `todo-sync/` | Todo-list lifecycle for phase tracking | `TodoSyncCoordinator` |
| `task-classifier/` | LLM-based intent + budget classification | `TaskClassifier` |
| `task-completion/` | Heuristic + LLM completion validation | `TaskCompletionEvaluator` |
| `context/` | Sliding window, summarization | `ContextFilter`, `SmartSummarizer` |
| `memory/` | Short-term, long-term, working memory | `MemoryManager` |
| `planning/` | Turn assembly, planning strategies | `TurnAssembler` |
| `modes/` | Execute, plan, edit, debug modes | `ModeRouter` |
| `events/` | Event emission for UI streaming | `EventEmitter` |
| `history/` | File change tracking integration | `FileChangeHistory` |

### Design Principles

- **Focused interfaces** — each module defines its own input types, zero dependency on Agent class
- **Callback injection** — LLM access, file I/O, tool execution provided via callbacks
- **Return data, not side effects** — modules return result objects; Agent applies side effects
- **Pure standalone functions** — exported for direct testing without class instantiation

## Execution Flow

```
classifyTask()          → intent (action/discovery/analysis) + budget
  ↓
extractScope()          → narrow working directory
  ↓
┌─ iteration loop ──────────────────────────────┐
│  buildPrompt()        → system + context       │
│  llm.chatWithTools()  → tool calls             │
│  executeTool()        → results                │
│  trackProgress()      → phase transitions      │
│  checkQualityGate()   → score + tier decision  │
│  reflect()            → self-evaluation        │
│  checkBudget()        → continue or stop       │
└────────────────────────────────────────────────┘
  ↓
validateCompletion()    → success/failure + summary
  ↓
emitRunKpis()           → analytics + regression detection
```

## Testing

```bash
pnpm test          # 406 tests across 17 files
pnpm lint          # 0 errors
pnpm type-check    # strict mode
```

## Dependencies

- `@kb-labs/agent-contracts` — shared types
- `@kb-labs/agent-tools` — tool registry
- `@kb-labs/agent-history` — file change tracking
- `@kb-labs/agent-tracing` — trace writing
- `@kb-labs/sdk` — platform SDK (LLM interfaces, session management)
