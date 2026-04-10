# Command Registration Quick Reference

## Global Flags

All commands support these global flags:

- `--json` - Output results in JSON format
- `--quiet` - Suppress non-essential output
- `--help` - Show command help
- `--version` - Show CLI version
- `--limit` - Print sandbox limits/permissions for the selected plugin/command without executing it
- `--profile <id>` - Select profile to use (can also use `KB_PROFILE` env var)

### Profile Selection

Use `--profile` to select which profile configuration to use:

```bash
# Use specific profile for command
kb --profile strict ai-review:check src/

# Via environment variable (useful for CI/CD)
KB_PROFILE=ci-strict kb workflow:run deploy

# Priority: --profile flag > KB_PROFILE env var > default
```

### JSON Mode

When `--json` is used, commands will output structured JSON:

```bash
kb hello --json
# {"ok":true,"data":{"message":"Hello, KB Labs!"}}

kb devlink plan --json
# {"ok":true,"plan":{...},"timings":{...}}
```

All JSON output follows this schema:

**Success:**
```typescript
{
  ok: true,
  data: any,              // Command-specific data
  warnings?: string[],    // Optional warnings
}
```

### Limit Inspection Mode

Use `--limit` to inspect the sandbox configuration declared in a plugin manifest:

```bash
kb audit --limit               # Plugin-level limits (fs/net/env/artifacts/quotas)
kb audit run --limit           # CLI command metadata + inherited limits
kb mind verify --limit --json  # Same information in JSON form
```

When `--limit` is present the CLI prints the information and exits without running the handler. Command-specific flags such as `--limit 5` continue to work because the CLI only intercepts boolean `--limit` usage.

**Error:**
```typescript
{
  ok: false,
  error: {
    code?: string,        // Error code (e.g., "E_INVALID_FLAGS")
    message: string,      // Human-readable error
    details?: any,        // Optional error details
  },
  warnings?: string[],    // Optional warnings
}
```

## File Structure

```
packages/commands/src/
├── commands/
│   ├── system/           # Standalone commands
│   │   ├── hello.ts
│   │   ├── version.ts
│   │   └── diagnose.ts
│   ├── devlink/          # DevLink product group
│   │   ├── plan.ts
│   │   ├── apply.ts
│   │   └── index.ts
│   └── profiles/         # Profiles product group
│       ├── validate.ts
│       ├── resolve.ts
│       └── index.ts
├── utils/
│   ├── registry.ts       # Command registry
│   ├── register.ts       # Registration logic
│   └── help-generator.ts # Help text generation
└── types/
    └── types.ts          # Command interfaces
```

## Command Template

### Standalone Command

```typescript
// packages/commands/src/commands/system/mycommand.ts
import type { Command } from "../../types";

export const mycommand: Command = {
  name: "mycommand",
  category: "system",
  describe: "Brief description",
  longDescription: "Detailed description",
  flags: [
    { name: "json", type: "boolean", description: "Output in JSON format" }
  ],
  examples: ["kb mycommand", "kb mycommand --json"],
  async run(ctx, argv, flags) {
    // Implementation
    return 0;
  }
};
```

### Group Command

```typescript
// packages/commands/src/commands/myproduct/mysubcommand.ts
import type { Command } from "../../types";

export const mysubcommand: Command = {
  name: "mysubcommand",
  category: "myproduct",
  describe: "Brief description",
  aliases: ["myproduct:mysubcommand"], // Backward compatibility
  flags: [
    { name: "dry-run", type: "boolean", description: "Show what would be done" },
    { name: "json", type: "boolean", description: "Output in JSON format" }
  ],
  examples: [
    "kb myproduct mysubcommand",
    "kb myproduct mysubcommand --dry-run"
  ],
  async run(ctx, argv, flags) {
    // Implementation
    return 0;
  }
};
```

### Group Index

```typescript
// packages/commands/src/commands/myproduct/index.ts
import type { CommandGroup } from "../../types";
import { mysubcommand } from './mysubcommand';

export const myproductGroup: CommandGroup = {
  name: "myproduct",
  describe: "My Product - Brief description",
  commands: [mysubcommand]
};

// Backward compatibility
export { mysubcommand as myproductMysubcommand };
```

## Registration Steps

### 1. Standalone Command

1. Create command file in `commands/system/`
2. Add to `utils/register.ts`:
   ```typescript
   registry.register(mycommand);
   ```
3. Export in `index.ts`:
   ```typescript
   export { mycommand } from "./commands/system/mycommand";
   ```

### 2. Group Command

1. Create command file in `commands/myproduct/`
2. Create/update `commands/myproduct/index.ts`
3. Add to `utils/register.ts`:
   ```typescript
   registry.registerGroup(myproductGroup);
   ```

## Flag Types

```typescript
// Boolean flag
{ name: "verbose", type: "boolean", description: "Enable verbose output" }

// String flag with choices
{ name: "mode", type: "string", choices: ["local", "remote"], default: "local" }

// Required string flag
{ name: "config", type: "string", required: true, description: "Config file path" }

// Array flag
{ name: "include", type: "array", description: "Files to include" }
```

## Common Patterns

### JSON Output

**Simple commands (recommended):**
```typescript
if (flags.json) {
  // Return payload - CLI will wrap it automatically
  return { result, timestamp: Date.now() };
} else {
  ctx.presenter.write("Human readable output");
  return 0;
}
```

**Complex commands:**
```typescript
if (flags.json) {
  ctx.presenter.json({
    ok: true,
    data: result,
    meta: { duration, warnings }
  });
  ctx.sentJSON = true;  // Tell CLI we handled JSON
  return 0;
} else {
  ctx.presenter.write("Human readable output");
  return 0;
}
```

### Error Handling

```typescript
try {
  // Command logic
  return 0;
} catch (error) {
  if (flags.json) {
    ctx.presenter.json({ ok: false, error: error.message });
  } else {
    ctx.presenter.error(`❌ Command failed: ${error.message}`);
  }
  return 1;
}
```

### Dry Run

```typescript
const dryRun = flags["dry-run"] as boolean;

if (dryRun) {
  ctx.presenter.write("Would perform action...");
} else {
  // Actually perform action
}
```

## Testing Commands

```bash
# Test command
pnpm kb mycommand

# Test with flags
pnpm kb mycommand --verbose --json

# Test group command
pnpm kb myproduct mysubcommand

# Test backward compatibility
pnpm kb myproduct:mysubcommand

# Test help
pnpm kb myproduct --help
```

## Exit Codes

Unified exit code system across all commands:

- `0` - Success
- `1` - Generic error
- `2` - Preflight cancelled (user cancelled operation)
- `3` - Invalid flags (validation error)

## Best Practices

1. **Always include `--json` flag** for commands with output
2. **Use `--dry-run`** for commands that make changes
3. **Provide meaningful examples** in the `examples` array
4. **Include `aliases`** for backward compatibility
5. **Return appropriate exit codes**
6. **Handle both text and JSON output modes**
7. **Use consistent naming** (kebab-case for commands)
8. **Write clear descriptions** for commands and flags
