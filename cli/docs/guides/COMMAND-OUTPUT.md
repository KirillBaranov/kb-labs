# Command Output Formatting Guide

This guide explains how to format CLI command outputs consistently across all KB Labs commands using the unified output pattern.

## Overview

All CLI commands should follow a consistent output pattern that includes:
- **Box formatting** for structured output
- **Timing information** for performance visibility
- **Summary metrics** showing what was accomplished
- **Consistent error handling** and diagnostics

## Quick Start

### Basic Command Pattern

```typescript
import { box, keyValue, formatTiming, TimingTracker } from '@kb-labs/shared-cli-ui';

export const run: CommandModule['run'] = async (ctx, argv, flags) => {
  const tracker = new TimingTracker();
  const jsonMode = !!flags.json;
  
  try {
    // ... command logic ...
    
    const totalTime = tracker.total();
    
    if (jsonMode) {
      ctx.presenter.json({ ok: true, ...result, timing: totalTime });
    } else {
      const summary = keyValue({
        'Status': 'Success',
        'Items': result.count,
        'Mode': flags.mode || 'default',
      });
      
      const output = box('Command Title', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
      ctx.presenter.write(output);
    }
    
    return 0;
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    if (jsonMode) {
      ctx.presenter.json({ ok: false, error: errorMessage, timing: tracker.total() });
    } else {
      ctx.presenter.error(errorMessage);
    }
    return 1;
  }
};
```

## Box Formatting

### When to Use Box Formatting

**Use box formatting for:**
- Commands that perform operations (apply, switch, freeze, etc.)
- Commands that show status or results (status, plan, version)
- Commands that process data (feed, pack, update)

**Don't use box formatting for:**
- Simple informational commands (hello)
- Commands with very long detailed output (keep detailed output, add summary box at end)

### Box Format Examples

#### Simple Summary Box

```typescript
const summary = keyValue({
  'Status': 'Success',
  'Files': 5,
  'Errors': 0,
});

const output = box('Operation Complete', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
ctx.presenter.write(output);
```

**Output:**
```
┌─ Operation Complete
│  Status: Success
│  Files  : 5
│  Errors : 0
│  
│  Time: 1.2s
└─ ✓ Done
```

#### Detailed Summary with Timing Breakdown

```typescript
const summary = keyValue({
  'Mode': 'local',
  'Actions': plan.actions.length,
  'Packages': Object.keys(plan.index.packages).length,
});

const timingInfo = [
  `Discovery: ${formatTiming(result.timings.discovery)}`,
  `Plan: ${formatTiming(result.timings.plan)}`,
  `Total: ${formatTiming(totalTime)}`,
];

const output = box('DevLink Plan', [...summary, '', ...timingInfo]);
ctx.presenter.write(output);
```

**Output:**
```
┌─ DevLink Plan
│  Mode    : local
│  Actions : 70
│  Packages: 6
│  
│  Discovery: 2ms
│  Plan     : 8ms
│  Total    : 13ms
└─ ✓ Done
```

## Timing Display

### TimingTracker Usage

Use `TimingTracker` for commands with multiple phases:

```typescript
const tracker = new TimingTracker();

// Mark checkpoints during execution
tracker.checkpoint('scan');
const scanResult = await scanWorkspace();

tracker.checkpoint('plan');
const planResult = await buildPlan(scanResult);

tracker.checkpoint('apply');
const applyResult = await applyPlan(planResult);

const totalTime = tracker.total();

// Display timing breakdown
const timingInfo = [
  `Scan: ${formatTiming(tracker.checkpointsOnly().scan)}`,
  `Plan: ${formatTiming(tracker.checkpointsOnly().plan)}`,
  `Apply: ${formatTiming(tracker.checkpointsOnly().apply)}`,
  `Total: ${formatTiming(totalTime)}`,
];
```

### Timing Format

Timing is automatically formatted for readability:
- `< 1000ms`: `123ms`
- `< 60s`: `1.2s`
- `>= 60s`: `1m 23s`

## Summary Metrics

### Key-Value Format

Use `keyValue()` for consistent summary formatting:

```typescript
const summary = keyValue({
  'Status': 'Success',
  'Files Processed': 15,
  'Errors': 0,
  'Mode': dryRun ? 'Dry Run' : 'Apply',
  'Needs Install': result.needsInstall ? 'Yes' : 'No',
});
```

### Common Summary Fields

**For file operations:**
- `Files`: Number of files processed
- `Directories`: Number of directories processed
- `Size`: Total size processed

**For package operations:**
- `Packages`: Number of packages
- `Dependencies`: Number of dependencies
- `Actions`: Number of actions performed

**For status operations:**
- `Status`: Overall status
- `Health`: Health score or status
- `Issues`: Number of issues found

## Error Handling

### Consistent Error Pattern

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
    ctx.presenter.error(errorMessage);
  }
  return 1;
}
```

### Error Display

For non-JSON mode, show errors clearly:
```typescript
ctx.presenter.error(`❌ Operation failed: ${errorMessage}`);
```

For JSON mode, include structured error information:
```typescript
ctx.presenter.json({
  ok: false,
  error: errorMessage,
  code: error.code,
  timing: tracker.total()
});
```

## Diagnostics and Warnings

### Adding Diagnostics

```typescript
if (result.diagnostics && result.diagnostics.length > 0) {
  ctx.presenter.write('');
  ctx.presenter.write('Diagnostics:');
  result.diagnostics.forEach(msg => 
    ctx.presenter.write(`  • ${msg}`)
  );
}
```

### Adding Warnings

```typescript
if (result.warnings && result.warnings.length > 0) {
  ctx.presenter.write('');
  ctx.presenter.write('Warnings:');
  result.warnings.forEach(warning => 
    ctx.presenter.write(`  ⚠️  ${warning}`)
  );
}
```

## JSON Output

### JSON Structure

All commands should support `--json` flag with consistent structure:

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

### JSON Timing

Include timing in JSON output:
- `timing`: Total execution time in milliseconds
- `timings`: Breakdown object for complex operations

## Advanced Patterns

### Commands with Long Detailed Output

For commands like `explain` that show detailed information, keep the detailed output but add a summary box at the end:

```typescript
// Show detailed output first
ctx.presenter.write("🔍 Configuration Resolution Trace\n\n");
// ... detailed trace output ...

// Add summary box at the end
const summary = keyValue({
  'Product': product,
  'Profile': profile,
  'Layers': totalLayers,
  'Settings': totalSettings,
});

const output = box('Bundle Explain', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
ctx.presenter.write(output);
```

### Commands with Progress Updates

For long-running commands, use loaders during execution:

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

## Best Practices

### Do's

✅ **Always include timing information**
✅ **Use consistent box formatting for operations**
✅ **Include relevant summary metrics**
✅ **Support both text and JSON output**
✅ **Handle errors gracefully with proper exit codes**
✅ **Use TimingTracker for multi-phase operations**
✅ **Include diagnostics and warnings when relevant**

### Don'ts

❌ **Don't use box formatting for simple informational commands**
❌ **Don't show timing in JSON as formatted strings (use milliseconds)**
❌ **Don't mix different output styles in the same command**
❌ **Don't forget to handle the `--json` flag**
❌ **Don't show sensitive information in output**

## Examples

### Before (Old Style)

```typescript
ctx.presenter.info('DevLink plan:');
ctx.presenter.write(`Actions: ${result.plan.actions.length}`);
if (result.diagnostics.length > 0) {
  ctx.presenter.write(`Diagnostics: ${result.diagnostics.join(', ')}`);
}
```

### After (New Style)

```typescript
const summary = keyValue({
  'Mode': mode,
  'Actions': result.plan.actions.length,
  'Packages': Object.keys(result.plan.index.packages).length,
  'Diagnostics': result.diagnostics.length,
});

const timingInfo = [
  `Discovery: ${formatTiming(result.timings.discovery)}`,
  `Plan: ${formatTiming(result.timings.plan)}`,
  `Total: ${formatTiming(totalTime)}`,
];

const output = box('DevLink Plan', [...summary, '', ...timingInfo]);
ctx.presenter.write(output);

if (result.diagnostics.length > 0) {
  ctx.presenter.write('');
  ctx.presenter.write('Diagnostics:');
  result.diagnostics.forEach(msg => 
    ctx.presenter.write(`  • ${msg}`)
  );
}
```

## Migration Checklist

When updating existing commands:

- [ ] Add `TimingTracker` for timing measurement
- [ ] Import utilities from `@kb-labs/shared-cli-ui`
- [ ] Replace basic output with `box()` formatting
- [ ] Add `keyValue()` summary with relevant metrics
- [ ] Include timing display
- [ ] Ensure `--json` flag support
- [ ] Test both text and JSON output modes
- [ ] Verify timing accuracy
- [ ] Check error handling

## Testing

Test commands with:
```bash
# Text output
kb command-name

# JSON output  
kb command-name --json

# Verify timing is reasonable
time kb command-name
```

This ensures consistent, professional output across all KB Labs CLI commands.
