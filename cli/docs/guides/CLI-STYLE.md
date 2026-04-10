# CLI Style Guide

This guide establishes consistent design principles and conventions for all KB Labs CLI tools.

## Design Principles

### 1. Consistency First
- All commands should follow the same output patterns
- Use shared utilities from `@kb-labs/shared-cli-ui`
- Maintain consistent error handling across all commands

### 2. User-Centric Design
- Prioritize readability and clarity
- Show relevant information without overwhelming users
- Provide helpful suggestions and next steps

### 3. Performance Visibility
- Always show execution timing
- Use `TimingTracker` for multi-phase operations
- Display progress indicators for long-running operations

## Command Naming Conventions

### Command Names
- Use **kebab-case**: `devlink:plan`, `mind:feed`
- Use **verbs** for actions: `plan`, `apply`, `freeze`, `update`
- Use **nouns** for queries: `status`, `version`, `diagnose`
- Keep names **short and descriptive**

### Flag Names
- Use **kebab-case**: `--dry-run`, `--force-mode`
- Use **descriptive names**: `--source-dir` not `--src`
- Provide **aliases** for common flags: `-v` for `--verbose`
- Use **boolean flags** for toggles: `--force`, `--quiet`

### Examples
```bash
# Good
kb devlink:plan --mode local --verbose
kb mind:feed --source ./data --dry-run

# Avoid
kb devlink plan --mode=local --v
kb mind feed --src ./data --dry_run
```

## Output Formatting Standards

### Box Formatting
Use `box()` formatting for all command outputs:

```typescript
const summary = keyValue({
  'Status': 'Success',
  'Files': 15,
  'Errors': 0,
  'Mode': 'local',
});

const output = box('Operation Complete', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
ctx.presenter.write(output);
```

**Output:**
```
┌─ Operation Complete
│  Status: Success
│  Files  : 15
│  Errors : 0
│  Mode   : local
│  
│  Time: 1.2s
└─ ✓ Done
```

### When to Use Box Formatting

**✅ Use box formatting for:**
- Commands that perform operations (apply, switch, freeze)
- Commands that show status or results (status, plan, version)
- Commands that process data (feed, pack, update)
- Help system (global help, product help)

**❌ Don't use box formatting for:**
- Simple informational commands (hello)
- Commands with extensive detailed output (keep detailed output, add summary box at end)

### Timing Display

Always include timing information:

```typescript
const tracker = new TimingTracker();

tracker.checkpoint('scan');
const scanResult = await scanWorkspace();

tracker.checkpoint('plan');
const planResult = await buildPlan(scanResult);

const totalTime = tracker.total();

// Display timing breakdown
const timingInfo = [
  `Scan: ${formatTiming(tracker.checkpointsOnly().scan)}`,
  `Plan: ${formatTiming(tracker.checkpointsOnly().plan)}`,
  `Total: ${formatTiming(totalTime)}`,
];
```

### Error Handling

Use consistent error handling pattern:

```typescript
try {
  // ... command logic ...
} catch (e: unknown) {
  const errorMessage = e instanceof Error ? e.message : String(e);
  
  if (jsonMode) {
    ctx.presenter.json({ 
      ok: false, 
      error: errorMessage, 
      timing: tracker.total() 
    });
  } else {
    ctx.presenter.error(`❌ Operation failed: ${errorMessage}`);
  }
  return 1;
}
```

## JSON Output Standards

### Structure
All commands must support `--json` flag with consistent structure:

```typescript
if (jsonMode) {
  ctx.presenter.json({
    ok: true,
    data: {
      // command-specific data
    },
    timing: totalTime,
    diagnostics: result.diagnostics || [],
    warnings: result.warnings || [],
  });
}
```

### Timing in JSON
- Use **milliseconds** for timing values
- Include both individual checkpoints and total time
- Don't format timing strings in JSON output

## Help System Standards

### Global Help (`kb --help`)
- Show all products and system commands
- Include emoji icons for visual distinction
- Show availability status with checkmarks
- Provide next steps and usage examples

### Product Help (`kb devlink --help`)
- List all available commands for the product
- Show command descriptions and examples
- Indicate unavailable commands with reasons
- Provide hints for resolving issues

### Command Help (`kb devlink:plan --help`)
- Show detailed command description
- List all flags with types and descriptions
- Provide usage examples
- Show default values and required flags

## Progress Indicators

### Loaders
Use `Loader` for long-running operations:

```typescript
const loader = new Loader({
  text: 'Processing...',
  spinner: true,
  jsonMode
});

if (!jsonMode) {
  loader.start();
}

// ... long operation ...

if (!jsonMode) {
  loader.succeed('Processing complete');
}
```

### When to Show Progress
- Operations taking > 1 second
- File system operations (scanning, copying)
- Network operations (downloading, uploading)
- Complex calculations or processing

## Color Usage

### Consistent Color Scheme
- **Cyan** - Command names, flags, file paths
- **Green** - Success indicators, checkmarks
- **Red** - Errors, failures, warnings
- **Yellow** - Hints, suggestions
- **Dim** - Secondary information, descriptions

### Accessibility
- Ensure sufficient contrast for all colors
- Don't rely solely on color for information
- Use symbols and text alongside colors

## Examples

### Good Command Output
```
┌─ DevLink Plan
│  Mode       : local
│  Actions    : 70
│  Packages   : 6
│  Diagnostics: 0
│  
│  Discovery: 2ms
│  Plan: 8ms
│  Total: 12ms
└─ ✓ Done
```

### Good Error Output
```
❌ Operation failed: Cannot find workspace configuration
   Hint: Run 'kb devlink init' to initialize workspace
```

### Good Help Output
```
┌─ 🔗 devlink
│  Available commands:
│  
│    ✓ devlink:plan         Plan workspace linking operations
│       kb devlink plan
│       kb devlink plan --verbose
│  
│  Next Steps:
│  
│    kb devlink:plan  Plan workspace linking operations
│  
│  Time: 0ms
└─ ✓ Done
```

## Best Practices

### Do's
✅ **Always include timing information**
✅ **Use consistent box formatting for operations**
✅ **Include relevant summary metrics**
✅ **Support both text and JSON output**
✅ **Handle errors gracefully with proper exit codes**
✅ **Use TimingTracker for multi-phase operations**
✅ **Include diagnostics and warnings when relevant**
✅ **Provide helpful hints and suggestions**

### Don'ts
❌ **Don't use box formatting for simple informational commands**
❌ **Don't show timing in JSON as formatted strings**
❌ **Don't mix different output styles in the same command**
❌ **Don't forget to handle the `--json` flag**
❌ **Don't show sensitive information in output**
❌ **Don't use colors without fallback text**
❌ **Don't make output too verbose or cluttered**

## Migration Guidelines

When updating existing commands:

1. **Add TimingTracker** for timing measurement
2. **Import utilities** from `@kb-labs/shared-cli-ui`
3. **Replace basic output** with `box()` formatting
4. **Add keyValue() summary** with relevant metrics
5. **Include timing display**
6. **Ensure `--json` flag support**
7. **Test both text and JSON output modes**
8. **Verify timing accuracy**
9. **Check error handling**

## References

- [Command Output Guide](./command-output.md) - Detailed formatting examples
- [Command Registration Guide](../COMMAND_REGISTRATION.md) - Command implementation patterns
- [ADR-0005: Unified CLI Output Formatting](../adr/0005-unified-cli-output-formatting.md) - Architectural decision
- [Contributing Guide](../CONTRIBUTING.md) - Development guidelines
