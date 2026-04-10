# @kb-labs/agent-tools

Tool registry and implementations for KB Labs agents. Provides all tools an agent can call through LLM function calling.

## Tools

| Tool | Module | Description |
|------|--------|-------------|
| `fs_read` | filesystem | Read file contents |
| `fs_write` | filesystem | Write/create files |
| `fs_list` | filesystem | List directory contents |
| `fs_search` | filesystem | Search files by pattern |
| `grep_search` | search | Regex search across files |
| `glob_search` | search | Find files by glob pattern |
| `semantic_search` | search | Semantic code search (Mind RAG) |
| `shell_exec` | shell | Execute shell commands (sandboxed) |
| `memory_read` | memory | Read agent memory |
| `memory_write` | memory | Write to agent memory |
| `todo_create` | reporting | Create todo items |
| `todo_update` | reporting | Update todo status |
| `delegate_task` | delegation | Delegate subtask to another agent |
| `ask_user` | interaction | Request user input |
| `mass_replace` | mass-replace | Bulk find-and-replace across files |

## Usage

```typescript
import { createToolRegistry } from '@kb-labs/agent-tools';

const registry = createToolRegistry(context);

// Get tool definitions for LLM function calling
const tools = registry.getDefinitions();

// Execute a tool call
const result = await registry.execute('fs_read', { path: 'src/index.ts' });
```

## Tool Configuration

Permissions and sandbox rules defined in `src/config.ts`:
- File system access boundaries
- Shell command allowlists
- Memory size limits
- Network access rules

## Structure

```
src/
├── types.ts          # Tool interface definitions
├── registry.ts       # Tool registry (register, get, execute)
├── config.ts         # Permissions and sandbox configuration
├── utils.ts          # Shared utilities
└── tools/
    ├── index.ts      # createToolRegistry factory
    ├── filesystem.ts # File read/write/list/search
    ├── search.ts     # grep, glob, semantic search
    ├── shell.ts      # Shell command execution
    ├── memory.ts     # Agent memory operations
    ├── reporting.ts  # Todo and reporting tools
    ├── delegation.ts # Task delegation
    ├── interaction.ts# User interaction
    └── mass-replace.ts
```

## Dependencies

- `@kb-labs/agent-contracts` — shared types
- `@kb-labs/core-platform` — platform services (semantic search)
- `glob` — file pattern matching
