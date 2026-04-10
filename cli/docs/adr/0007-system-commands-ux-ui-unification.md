# ADR-0007: System Commands UX/UI Unification

**Date:** 2025-10-27
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [cli, ui/ux]

## Context

After migrating business commands to the manifest system, the remaining system commands in the CLI core had inconsistent output formatting:

- **`hello`** - Simple text output without formatting
- **`diagnose`** - Plain key=value format
- **`plugins cache clear`** - Basic success/error messages
- **`plugins list`** - Already had box formatting (updated earlier)
- **`version`** - Already had box formatting

This inconsistency violated the unified CLI output principles established in ADR-0005 and created a poor user experience where system commands looked different from business commands.

## Decision

We will unify all system commands to use the same UX/UI patterns as business commands, implementing the unified CLI output formatting system from ADR-0005.

### Unified Pattern for All System Commands

**Core Components:**
- `box()` - Consistent box formatting with titles
- `keyValue()` - Structured key-value pair display
- `TimingTracker` - Execution timing measurement
- `safeColors` and `safeSymbols` - Consistent color and symbol usage
- JSON mode support with `timing` information
- Unified error handling

**Command Template:**
```typescript
export const commandName: Command = {
  name: "command-name",
  category: "system",
  describe: "Command description",
  
  async run(ctx, argv, flags) {
    const tracker = new TimingTracker();
    const jsonMode = !!flags.json;
    
    try {
      // Command logic
      const result = await performOperation();
      const totalTime = tracker.total();

      if (jsonMode) {
        ctx.presenter.json({ 
          ok: true, 
          ...result, 
          timing: totalTime 
        });
      } else {
        const summary = keyValue({
          'Status': safeSymbols.success + ' Success',
          'Details': result.message,
          // ... other key-value pairs
        });
        
        const output = box('Command Title', [
          ...summary, 
          '', 
          safeColors.dim(`Time: ${formatTiming(totalTime)}`)
        ]);
        ctx.presenter.write(output);
      }
      
      return 0;
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
  },
};
```

### Specific Command Updates

**`hello` Command:**
```typescript
// Before: Simple text
ctx.presenter.write(`Hello, ${who}!`);

// After: Structured output
const summary = keyValue({
  'Message': `Hello, ${who}!`,
  'User': who,
  'Status': safeSymbols.success + ' Ready',
});
const output = box('KB Labs CLI', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
ctx.presenter.write(output);
```

**`diagnose` Command:**
```typescript
// Before: Plain key=value
ctx.presenter.write(`node=${nodeVersion}`);
ctx.presenter.write(`repoRoot=${repoRoot}`);

// After: Structured key-value pairs
const summary = keyValue({
  'Node Version': nodeVersion,
  'Platform': platform,
  'Repository Root': repoRoot,
  'Current Directory': cwd,
  'Status': safeSymbols.success + ' Environment OK',
});
const output = box('Environment Diagnosis', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
ctx.presenter.write(output);
```

**`plugins cache clear` Command:**
```typescript
// Before: Simple success message
ctx.presenter.write(`Cache cleared: ${cachePath}\n`);

// After: Structured status
const summary = keyValue({
  'Action': 'Cache Cleared',
  'Path': cachePath,
  'Status': safeSymbols.success + ' Success',
});
const output = box('Cache Management', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
ctx.presenter.write(output);
```

## Consequences

### Positive

- **Complete Consistency** - All CLI commands now follow the same visual pattern
- **Professional Appearance** - System commands look polished and consistent
- **Better Debugging** - Timing information helps identify performance issues
- **Improved Error Handling** - Consistent error presentation across all commands
- **Enhanced JSON Output** - All commands provide machine-readable output with timing
- **User Experience** - Users see the same interface regardless of command type

### Negative

- **Code Complexity** - Simple commands now have more complex output logic
- **Bundle Size** - Additional formatting code increases CLI size slightly
- **Migration Effort** - All system commands needed updates

### Risks

- **Over-Engineering** - Risk of making simple commands unnecessarily complex
- **Performance Impact** - Additional formatting overhead for simple operations
- **Breaking Changes** - Scripts relying on specific output format may break

### Mitigation

- **Gradual Migration** - Updated commands incrementally to catch issues
- **Backward Compatibility** - JSON output format remains consistent
- **Comprehensive Testing** - Verified all commands work correctly
- **Documentation** - Updated command documentation reflects new output format

## Implementation Results

### Before Unification
```
Hello, KB Labs!

node=v20.19.4
repoRoot=/path/to/repo

Cache cleared: /path/to/cache
```

### After Unification
```
┌─ KB Labs CLI           
│  Message: Hello, KB Labs!
│  User   : KB Labs
│  Status : ✓ Ready
│  
│  Time: 0ms
└─ ✓ Done

┌─ Environment Diagnosis                                            
│  Node Version     : v20.19.4
│  Platform         : darwin arm64
│  Repository Root  : /path/to/repo
│  Current Directory: /path/to/repo
│  Status           : ✓ Environment OK
│  
│  Time: 0ms
└─ ✓ Done

┌─ Cache Management                                                                   
│  Action: Cache Cleared
│  Path  : /path/to/cache
│  Status: ✓ Success
│  
│  Time: 1ms
└─ ✓ Done
```

## Validation

All system commands now provide:
- ✅ Consistent box formatting with titles
- ✅ Structured key-value pair display
- ✅ Execution timing information
- ✅ JSON mode support with timing
- ✅ Unified error handling
- ✅ Professional appearance

## References

- [ADR-0005: Unified CLI Output Formatting](./0005-unified-cli-output-formatting.md)
- [ADR-0006: Legacy Command Migration to Manifest System](./0006-legacy-command-migration-to-manifest-system.md)
- [CLI Style Guide](../guides/cli-style.md)
- [Command Output Guide](../guides/command-output.md)
