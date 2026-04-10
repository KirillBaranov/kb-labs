# @kb-labs/review-contracts

Type definitions and contracts for AI Review plugin.

## Overview

This package contains all TypeScript interfaces, types, and contracts used across the AI Review plugin packages.

## Key Types

### Core Types

- **`ReviewFinding`** - Represents a single code review finding
- **`ReviewRule`** - Rule definition (heuristic or LLM)
- **`ReviewPreset`** - Configuration preset (set of rules)
- **`ReviewResult`** - Complete review result with findings and metadata

### Engine Types

- **`EngineType`** - Engine categories (compiler, linter, sast, ast, llm)
- **`HeuristicEngine`** - Engine registry entry mapping tools to types
- **`FindingSeverity`** - Severity levels (blocker, high, medium, low, info)
- **`FindingConfidence`** - Confidence levels (certain, likely, heuristic)

### Review Flow

- **`ReviewRequest`** - Input for review operation
- **`ReviewContext`** - Context for LLM analyzers
- **`ParsedFile`** - File representation with content hash

## Usage

```typescript
import type {
  ReviewFinding,
  ReviewRule,
  ReviewPreset,
  ReviewResult,
} from '@kb-labs/review-contracts';
```

## Design Principles

1. **Unified Contract** - All engines use same interfaces
2. **Engine Type Priority** - Deduplication by engine type, not specific tool
3. **Content-Hash Based** - Deterministic caching keys
4. **Agent Gating** - Confidence + fix + scope fields for agent filtering
