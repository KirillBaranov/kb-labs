# Logging System Documentation

## Overview

The KB Labs CLI uses a structured logging system that respects the `KB_LOG_LEVEL` environment variable. All diagnostic output goes to `stderr`, leaving `stdout` free for command output.

## Environment Variable

### `KB_LOG_LEVEL`

Controls the verbosity of diagnostic output:

- `silent` - No diagnostic output
- `error` - Error messages only
- `warn` - Warnings and errors (default)
- `info` - Informational messages
- `debug` - Debug information

## Usage

### Setting Log Level

```bash
# Set log level via environment variable
export KB_LOG_LEVEL=debug
kb command

# Or inline
KB_LOG_LEVEL=info kb command
```

### Default Behavior

If `KB_LOG_LEVEL` is not set, the system defaults to `warn` level.

## Log Levels

### `silent`
- No diagnostic output
- Only command output to stdout
- Errors are still handled but not logged

### `error`
- Only error messages
- Critical failures
- System errors

### `warn` (default)
- Warning messages
- Non-critical issues
- Deprecation notices
- Error messages

### `info`
- Informational messages
- Progress updates
- Status information
- Warning and error messages

### `debug`
- Debug information
- Internal operations
- Detailed diagnostics
- All other log levels

## Implementation

### Logger Function

```typescript
import { log } from '../utils/logger.js';

// Log at different levels
log('error', 'Critical error occurred');
log('warn', 'Warning message');
log('info', 'Informational message');
log('debug', 'Debug information');
```

### Automatic Level Filtering

The logger automatically filters messages based on the current log level:

```typescript
// Only shows if current level allows it
log('debug', 'This will only show in debug mode');
log('info', 'This will show in info, warn, and error modes');
log('error', 'This will always show (unless silent)');
```

## Output Format

All log messages follow this format:

```
[LEVEL] message
```

Examples:
```
[ERROR] Critical error occurred
[WARN] Warning message
[INFO] Informational message
[DEBUG] Debug information
```

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// Error - Critical failures
log('error', 'Failed to load manifest: ${error.message}');

// Warn - Non-critical issues
log('warn', 'Manifest validation failed, skipping: ${manifest.id}');

// Info - Progress updates
log('info', 'Discovered ${count} packages with CLI manifests');

// Debug - Internal operations
log('debug', 'Loading manifest from ${manifestPath}');
```

### 2. Avoid Logging in Production Commands

Commands should not use the logger for their main output. Use the presenter instead:

```typescript
// ❌ Don't do this
log('info', 'Command completed successfully');

// ✅ Do this instead
ctx.presenter.info('Command completed successfully');
```

### 3. Use Logger for System Diagnostics

The logger is intended for system diagnostics, not command output:

```typescript
// ✅ Good use of logger
log('debug', 'Starting manifest discovery');
log('info', 'Discovered ${results.length} manifests');
log('warn', 'Some manifests failed to load');

// ✅ Good use of presenter
ctx.presenter.info('Command completed successfully');
ctx.presenter.warn('Some files were skipped');
ctx.presenter.error('Command failed');
```

### 4. Handle Silent Mode

When `KB_LOG_LEVEL=silent`, the logger will not output anything:

```typescript
// This will not output anything in silent mode
log('info', 'This message will be suppressed');
```

## Integration with Commands

### Command Context

Commands receive a presenter for their output, not the logger:

```typescript
interface CommandContext {
  presenter: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
    json: (data: any) => void;
  };
}
```

### System vs Command Output

- **System Output** (logger) → `stderr`
- **Command Output** (presenter) → `stdout`

This separation allows for clean output redirection:

```bash
# Command output goes to file, system logs go to console
kb command > output.txt

# System logs go to file, command output goes to console
kb command 2> logs.txt

# Both go to file
kb command > output.txt 2> logs.txt
```

## Testing

### Mocking the Logger

In tests, you can mock the logger:

```typescript
import { vi } from 'vitest';

vi.mock('../utils/logger.js', () => ({
  log: vi.fn(),
}));
```

### Testing Log Output

```typescript
import { log } from '../utils/logger.js';

// Test that log was called with correct parameters
expect(log).toHaveBeenCalledWith('info', 'Expected message');
```

## Examples

### Discovery Process

```typescript
// Debug level
log('debug', 'Starting manifest discovery in ${cwd}');
log('debug', 'Checking for pnpm-workspace.yaml');

// Info level
log('info', 'Discovered ${results.length} packages with CLI manifests');

// Warn level
log('warn', 'Failed to load manifest from ${pkgName}: ${error.message}');

// Error level
log('error', 'Discovery failed: ${error.message}');
```

### Command Registration

```typescript
// Debug level
log('debug', 'Registering manifest: ${manifest.id}');
log('debug', 'Checking availability for ${manifest.id}');

// Info level
log('info', 'Registered ${registered.length} commands');

// Warn level
log('warn', 'Command ${manifest.id} is unavailable: ${reason}');
```

### Command Execution

```typescript
// Debug level
log('debug', 'Executing command: ${cmd.manifest.id}');
log('debug', 'Command flags: ${JSON.stringify(flags)}');

// Info level
log('info', 'Command completed successfully');

// Error level
log('error', 'Command execution failed: ${error.message}');
```

## Troubleshooting

### Common Issues

1. **No output in silent mode**
   - This is expected behavior
   - Use `KB_LOG_LEVEL=warn` for basic output

2. **Too much output in debug mode**
   - Debug mode shows all diagnostic information
   - Use `KB_LOG_LEVEL=info` for less verbose output

3. **Logs mixed with command output**
   - Logs go to `stderr`, command output goes to `stdout`
   - Use output redirection to separate them

### Debugging Commands

```bash
# See all diagnostic information
KB_LOG_LEVEL=debug kb command

# See only errors and warnings
KB_LOG_LEVEL=warn kb command

# See no diagnostic output
KB_LOG_LEVEL=silent kb command
```

### Debugging Discovery

```bash
# See manifest discovery process
KB_LOG_LEVEL=debug kb plugins list

# See only discovery results
KB_LOG_LEVEL=info kb plugins list
```
