# CLI Architecture

## Overview

The KB Labs CLI follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────┐
│  packages/cli (CLI Layer)           │
│  - Argument parsing                 │
│  - Global flag handling             │
│  - JSON output wrapping             │
│  - Error handling                   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  packages/commands (Command Layer)  │
│  - Command definitions              │
│  - Business logic                   │
│  - Flag validation                  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  packages/core (Core Layer)         │
│  - Context management               │
│  - Presenter abstraction            │
│  - Error types                      │
│  - Flag parsing                     │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  packages/adapters (Adapter Layer)  │
│  - File I/O                         │
│  - Environment access               │
│  - External integrations            │
└─────────────────────────────────────┘
```

## CLI Layer (packages/cli)

**Responsibility:** Entry point, global orchestration

**Key file:** `packages/cli/src/index.ts`

The CLI layer:
1. Parses command-line arguments
2. Extracts global flags (`--json`, `--quiet`, etc.)
3. Creates appropriate presenter (JSON or Text)
4. Executes command with context
5. Wraps results for JSON mode
6. Handles errors uniformly

**JSON Mode Pipeline:**

```typescript
try {
  const result = await cmd.run(ctx, rest, flags);
  
  if (global.json && !ctx.sentJSON) {
    // Auto-wrap simple command results
    presenter.json({
      ok: true,
      data: result ?? null,
      warnings: ctx.diagnostics,
    });
  }
  
  return typeof result === 'number' ? result : 0;
} catch (error) {
  // Uniform error handling in JSON/text mode
}
```

## Command Layer (packages/commands)

**Responsibility:** Business logic, command implementation

Commands follow one of two patterns:

### Pattern 1: Simple Return

For straightforward commands, return data object:

```typescript
async run(ctx, argv, flags) {
  if (flags.json) {
    return { status: "ok", data: {...} };
  } else {
    ctx.presenter.write("Status: ok");
    return 0;
  }
}
```

CLI automatically wraps: `{ ok: true, data: { status: "ok", ... } }`

### Pattern 2: Manual Control

For complex output, use `presenter.json()`:

```typescript
async run(ctx, argv, flags) {
  if (flags.json) {
    ctx.presenter.json({ ok: true, custom: "structure" });
    ctx.sentJSON = true;
    return 0;
  } else {
    // complex text rendering
  }
}
```

## Core Layer (packages/core)

**Responsibility:** Shared abstractions and utilities

### Context (`CliContext`)

Passed to every command:

```typescript
interface CliContext {
  presenter: Presenter;      // Output abstraction
  env: NodeJS.ProcessEnv;    // Environment variables
  repoRoot?: string;         // Detected repository root
  diagnostics: string[];     // Collected warnings
  sentJSON?: boolean;        // Flag for manual JSON
  logger?: Logger;           // Optional logging
  profile?: Profile;         // Optional profile
  config?: Record<any, any>; // Optional config
}
```

### Presenter Abstraction

Unified output interface:

```typescript
interface Presenter {
  isTTY: boolean;           // Is terminal interactive?
  isQuiet: boolean;         // Suppress non-essential output?
  isJSON: boolean;          // JSON mode active?
  write(line: string): void;    // Normal output
  warn(line: string): void;     // Warnings
  error(line: string): void;    // Errors
  json(payload: unknown): void; // Direct JSON
}
```

**Behavior by mode:**

| Method  | Text Mode              | JSON Mode                |
|---------|------------------------|--------------------------|
| write() | console.log()          | no-op                    |
| warn()  | console.warn()         | → ctx.diagnostics[]      |
| error() | console.error()        | console.log(JSON error)  |
| json()  | throw Error            | console.log(JSON)        |

### Error Handling

```typescript
class CliError extends Error {
  code: CliErrorCode;
  details?: unknown;
}

// Standard error codes
CLI_ERROR_CODES = {
  E_INVALID_FLAGS,
  E_PREFLIGHT_CANCELLED,
  E_IO_READ,
  // ...
}

// Exit code mapping
EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  PREFLIGHT_CANCELLED: 2,
  INVALID_FLAGS: 3,
}
```

## Data Flow

### Successful Command (Simple Return)

```
User: kb hello --json
  ↓
CLI: parseArgs() → { global: { json: true }, cmdPath: ["hello"] }
  ↓
CLI: createJsonPresenter()
  ↓
CLI: createContext({ presenter })
  ↓
CLI: hello.run(ctx, [], { json: true })
  ↓
Command: return { message: "Hello, KB Labs!" }
  ↓
CLI: presenter.json({ ok: true, data: { message: "..." } })
  ↓
Output: {"ok":true,"data":{"message":"Hello, KB Labs!"}}
```

### Error Flow

```
Command: throw new CliError(E_INVALID_FLAGS, "Bad input")
  ↓
CLI: catch (e instanceof CliError)
  ↓
CLI: exitCode = mapCliErrorToExitCode(e.code) // 3
  ↓
CLI: presenter.json({ ok: false, error: { code: "E_INVALID_FLAGS", ... } })
  ↓
CLI: return exitCode (3)
```

## Extension Points

1. **Add new commands** - Implement `Command` interface in `packages/commands`
2. **Add new presenters** - Implement `Presenter` interface (e.g., for HTML output)
3. **Add new adapters** - Extend `packages/adapters` for new integrations
4. **Add new error codes** - Extend `CLI_ERROR_CODES` in `packages/core/src/errors.ts`

## Design Principles

1. **Separation of concerns** - Each layer has clear responsibility
2. **Global behavior at the edges** - JSON wrapping happens in CLI layer
3. **Commands are pure** - No global state, receive everything via context
4. **Consistent error handling** - All errors flow through same pipeline
5. **Mode-aware presentation** - Presenter adapts to JSON/text/quiet modes
6. **Fail fast** - Validate early (flags, inputs) before expensive operations
