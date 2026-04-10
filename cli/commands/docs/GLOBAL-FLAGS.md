# Global Flags Documentation

## Overview

All KB Labs CLI commands receive a set of global flags regardless of their own flag definitions. These flags are guaranteed to be passed through to all commands and provide consistent behavior across the CLI.

## Global Flags

### `--json`
- **Type**: `boolean`
- **Description**: Output in JSON format
- **Usage**: `kb command --json`
- **Behavior**: Commands should return structured JSON data instead of human-readable text

### `--only-available`
- **Type**: `boolean`
- **Description**: Show only available commands (help only)
- **Usage**: `kb --help --only-available`
- **Behavior**: Filters out unavailable commands from help output

### `--no-cache`
- **Type**: `boolean`
- **Description**: Force discovery refresh
- **Usage**: `kb command --no-cache`
- **Behavior**: Bypasses cache and re-discovers all command manifests

### `--verbose`
- **Type**: `boolean`
- **Description**: Detailed output
- **Usage**: `kb command --verbose`
- **Behavior**: Commands should provide more detailed information about their operations

### `--quiet`
- **Type**: `boolean`
- **Description**: Minimal output
- **Usage**: `kb command --quiet`
- **Behavior**: Commands should suppress non-essential output

### `--help`
- **Type**: `boolean`
- **Description**: Show help information
- **Usage**: `kb command --help`
- **Behavior**: Commands should display their help information and exit

### `--version`
- **Type**: `boolean`
- **Description**: Show CLI version
- **Usage**: `kb --version`
- **Behavior**: Commands should display version information and exit

## Implementation

### Command Interface

Commands receive global flags in their `run` method:

```typescript
interface CommandModule {
  run: (
    ctx: CommandContext,
    argv: string[],
    flags: Record<string, any>
  ) => Promise<number | void>;
}
```

### Flag Passthrough

Global flags are automatically passed to all commands:

```typescript
// In runCommand function
const allFlags = { ...flags };
for (const flag of GLOBAL_FLAGS) {
  if (flag in flags) allFlags[flag] = flags[flag];
}

const result = await mod.run(ctx, argv, allFlags);
```

### JSON Mode Behavior

When `--json` is true, commands should:

1. Return structured JSON data
2. Use `ctx.presenter.json()` for output
3. Handle errors with structured error responses
4. Return appropriate exit codes

Example:
```typescript
async run(ctx, argv, flags) {
  if (flags.json) {
    ctx.presenter.json({
      ok: true,
      result: "Command completed successfully",
      data: { /* structured data */ }
    });
    return 0;
  }
  
  // Regular text output
  ctx.presenter.info("Command completed successfully");
  return 0;
}
```

### Verbose Mode

When `--verbose` is true, commands should:

1. Provide detailed logging
2. Show internal operations
3. Display diagnostic information
4. Use `ctx.presenter.info()` for verbose output

Example:
```typescript
async run(ctx, argv, flags) {
  if (flags.verbose) {
    ctx.presenter.info("Starting command execution...");
    ctx.presenter.info(`Arguments: ${argv.join(' ')}`);
    ctx.presenter.info(`Flags: ${JSON.stringify(flags)}`);
  }
  
  // Command logic
  if (flags.verbose) {
    ctx.presenter.info("Command completed successfully");
  }
  
  return 0;
}
```

### Quiet Mode

When `--quiet` is true, commands should:

1. Suppress non-essential output
2. Only show critical information
3. Avoid using `ctx.presenter.info()`
4. Use `ctx.presenter.warn()` and `ctx.presenter.error()` sparingly

Example:
```typescript
async run(ctx, argv, flags) {
  if (!flags.quiet) {
    ctx.presenter.info("Starting command execution...");
  }
  
  // Command logic
  
  if (!flags.quiet) {
    ctx.presenter.info("Command completed successfully");
  }
  
  return 0;
}
```

## Environment Variables

### `KB_LOG_LEVEL`

Controls diagnostic output level:

- `silent` - No diagnostic output
- `error` - Error messages only
- `warn` - Warnings and errors (default)
- `info` - Informational messages
- `debug` - Debug information

All diagnostic output goes to `stderr`, leaving `stdout` free for command output.

## Best Practices

### 1. Always Handle Global Flags

Commands should always check for global flags and behave accordingly:

```typescript
async run(ctx, argv, flags) {
  // Handle help flag
  if (flags.help) {
    ctx.presenter.info("Command help information");
    return 0;
  }
  
  // Handle version flag
  if (flags.version) {
    ctx.presenter.info("Command version information");
    return 0;
  }
  
  // Handle JSON mode
  if (flags.json) {
    // Return JSON output
  } else {
    // Return text output
  }
  
  // Handle verbose mode
  if (flags.verbose) {
    // Provide detailed output
  }
  
  // Handle quiet mode
  if (flags.quiet) {
    // Suppress non-essential output
  }
}
```

### 2. Use Appropriate Exit Codes

- `0` - Success
- `1` - Command error / invalid module
- `2` - Command unavailable (missing dependencies)

### 3. Handle Unavailable Commands

Commands that are unavailable due to missing dependencies should:

1. Return exit code 2
2. Provide clear error messages
3. Include helpful hints
4. Support JSON mode for structured error responses

### 4. Respect Output Modes

- Use `ctx.presenter.json()` for JSON output
- Use `ctx.presenter.info()` for informational messages
- Use `ctx.presenter.warn()` for warnings
- Use `ctx.presenter.error()` for errors
- Use `ctx.presenter.info()` for verbose output

## Testing

Global flags are tested in the registry system tests:

- Flag passthrough verification
- JSON mode behavior
- Verbose mode output
- Quiet mode suppression
- Help and version handling

See `src/registry/__tests__/` for comprehensive test coverage.
