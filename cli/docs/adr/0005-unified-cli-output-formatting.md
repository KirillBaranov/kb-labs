# ADR-0005: Unified CLI Output Formatting

**Date:** 2025-10-27
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [cli, ui/ux]

## Context

The KB Labs CLI ecosystem consists of multiple packages (kb-labs-cli, kb-labs-devlink, kb-labs-mind) with different output formatting styles. This inconsistency creates:

- **Poor user experience** - Users see different output styles across commands
- **Maintenance overhead** - Each package implements its own formatting logic
- **Inconsistent timing display** - Some commands show timing, others don't
- **No standardized error handling** - Different error presentation patterns

## Decision

We will implement a **unified CLI output formatting system** with the following characteristics:

### Core Principles

1. **Box Formatting** - All command outputs use consistent box-style formatting with titles
2. **Timing Display** - All commands show execution time using `TimingTracker`
3. **Summary Metrics** - Commands display key-value summary information
4. **JSON Mode Support** - All commands support `--json` flag for machine-readable output
5. **Shared Utilities** - Common formatting logic moved to `@kb-labs/shared-cli-ui`

### Technical Implementation

**Shared Package Structure:**
```
@kb-labs/shared-cli-ui/
├── box()              # Box formatting with title
├── keyValue()         # Key-value pair formatting
├── formatTiming()     # Human-readable timing display
├── TimingTracker     # Execution timing tracking
└── Loader            # Progress indicators
```

**Command Pattern:**
```typescript
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

### Scope

**Commands Updated:**
- All devlink commands (plan, apply, freeze, undo, switch, update, watch, status)
- All mind commands (feed, init, pack, update)
- CLI builtin commands (version, diagnose, plugins-list, explain)
- Help system (global help, product help, command help)

**Commands Excluded:**
- Simple informational commands (hello) - keep minimal output
- Commands with extensive detailed output - add summary box at end

## Consequences

### Positive

- **Consistent UX** - All commands follow the same visual pattern
- **Better Performance Visibility** - Users can see execution timing
- **Reduced Maintenance** - Shared utilities eliminate code duplication
- **Improved Debugging** - Standardized error handling and diagnostics
- **Professional Appearance** - Unified box formatting looks polished

### Negative

- **Migration Effort** - All existing commands need updates
- **Bundle Size** - Additional shared package increases CLI size
- **Learning Curve** - Developers need to learn new patterns

### Risks

- **Over-Engineering** - Risk of making simple commands too complex
- **Performance Impact** - Additional formatting overhead
- **Breaking Changes** - Existing scripts relying on specific output format

### Mitigation

- **Gradual Migration** - Update commands incrementally
- **Backward Compatibility** - JSON output remains unchanged
- **Documentation** - Comprehensive guides for new patterns
- **Testing** - Verify all commands work correctly after updates

## Implementation Timeline

1. **Phase 1** - Create `@kb-labs/shared-cli-ui` package
2. **Phase 2** - Update devlink and mind commands
3. **Phase 3** - Update CLI builtin commands
4. **Phase 4** - Update help system
5. **Phase 5** - Update documentation and guides

## References

- [Command Output Guide](../guides/command-output.md)
- [CLI Style Guide](../guides/cli-style.md)
- [Command Registration Guide](../COMMAND_REGISTRATION.md)
